const { request, fetchSettings, addWalletTransaction, createAuditLog } = require('./db');
const { sendMessage } = require('./telegram');

// Buyurtma bajarilganda referrerga foizli bonus beradi.
//
// Tartib ataylab shunday qat'iy:
//   1) referral_payouts ga "da'vo" (claim) yoziladi — PRIMARY KEY order_id
//      tufayli xuddi shu buyurtma uchun ikkinchi urinish bo'sh qaytadi va
//      funksiya jim chiqib ketadi. Ilgari idempotentlik audit_logs dan
//      O'QISH edi, yozuv esa jarayon oxirida: 2026-08-23 da jarayon o'rtada
//      uzilib pul to'langan-u, hech qanday iz qolmagan — takror to'lov
//      xavfi ochiq edi.
//   2) pul (wallet) va referrals hisobi;
//   3) Telegram xabari ENG OXIRIDA — jarayon o'lsa xabar yo'qoladi xolos,
//      hisob-kitob buzilmaydi.
async function processReferralPayout(supabase, order) {
  try {
    const telegramId = String(order.user_telegram_id);
    const { data } = await request(supabase, 'referrals', {
      query: `select=*&referred_telegram_id=eq.${telegramId}&limit=1`,
    });
    const ref = data?.[0];
    // 'cancelled' — admin panel orqali to'xtatilgan referal: bonus to'lanmaydi.
    if (!ref || ref.status === 'cancelled') return;

    const settings = await fetchSettings(supabase);
    const referrerId = ref.referrer_telegram_id;
    const orderAmount = Number(order.base_price || order.amount || 0);
    const percent = Number(settings?.referral_percent || 0);
    const percentBonus = percent > 0 && orderAmount > 0 ? Math.floor((orderAmount * percent) / 100) : 0;
    if (percentBonus <= 0) return;

    // 1) Da'vo: shu buyurtma bo'yicha payout faqat bitta bo'ladi.
    const { data: claim } = await request(supabase, 'referral_payouts', {
      method: 'POST',
      query: 'on_conflict=order_id',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: {
        order_id: order.id,
        referrer_telegram_id: referrerId,
        referred_telegram_id: telegramId,
        amount: percentBonus,
        kind: 'percent',
      },
    });
    if (!claim?.[0]) return; // allaqachon to'langan (yoki parallel chaqiruv yutdi)

    // 2) Pul va hisob. notify: false — quyida o'zimizning aniqroq
    // "referalingiz xarid qildi" xabarimiz bor, ikki xabar ketmasin.
    await addWalletTransaction(supabase, {
      user_telegram_id: referrerId,
      order_id: order.id,
      amount: percentBonus,
      type: 'referral',
      description: `Referal ${percent}% (#${telegramId} xaridi)`,
      notify: false,
    });

    await request(supabase, 'referrals', {
      method: 'PATCH',
      query: `referred_telegram_id=eq.${telegramId}`,
      body: {
        // 'rewarded' — referrals.status CHECK constraint faqat
        // ('registered','rewarded','cancelled') qabul qiladi.
        status: 'rewarded',
        first_order_id: ref.first_order_id || order.id,
        total_earned: Number(ref.total_earned || 0) + percentBonus,
        purchase_count: Number(ref.purchase_count || 0) + 1,
        updated_at: new Date().toISOString(),
      },
    }).catch((e) => console.warn('referral update warn:', e?.message));

    await createAuditLog(supabase, {
      order_id: order.id,
      user_telegram_id: telegramId,
      action: 'referral_payout',
      status: 'completed',
      metadata: { referrer: referrerId, percent, accrued: percentBonus, first: ref.status === 'registered' },
    });

    // 3) Xabar — barcha hisob yozuvlaridan keyin.
    await sendMessage(referrerId, `🎁 Referalingiz xarid qildi! Balansingizga +${percentBonus.toLocaleString('uz-UZ')} UZS (${percent}%) qo'shildi.`).catch(() => {});
  } catch (err) {
    console.warn('referral payout warn:', err?.message);
  }
}

// Taklif qilingan foydalanuvchi raqamini TASDIQLAGANDA chaqiriladi
// (telegram-webhook kontakt bo'limi; raqam avvaldan tasdiqlangan bo'lsa —
// handleStart dagi ro'yxatga olishdan keyin darhol).
//
// 2026-08-27 nakrutkasi saboqlari: bonus akkaunt ochilgani uchun EMAS,
// SIM tasdig'i uchun to'lanadi. signup_bonus_at ustunidagi NULL bo'yicha
// atomik PATCH — poyga himoyasi: bitta referal uchun bonus faqat bir marta
// (welcome_bonus_at bilan bir xil naqsh).
async function payReferralSignupBonus(supabase, referredTelegramId) {
  try {
    const referredId = String(referredTelegramId);
    const settings = await fetchSettings(supabase).catch(() => null);
    const bonus = Math.round(Number(settings?.referral_fixed_bonus || 0));
    if (!(bonus > 0)) return null;

    // Da'vo: faqat bitta parallel chaqiruv qatorni oladi; bekor qilingan
    // (cancelled) referalga bonus yo'q.
    const { data } = await request(supabase, 'referrals', {
      method: 'PATCH',
      query: `referred_telegram_id=eq.${referredId}&signup_bonus_at=is.null&status=neq.cancelled`,
      headers: { Prefer: 'return=representation' },
      body: { signup_bonus_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    });
    const ref = data?.[0];
    if (!ref) return null; // referal yo'q, bekor qilingan yoki bonus allaqachon to'langan

    // notify: false — pastda o'zimizning aniqroq xabarimiz bor.
    await addWalletTransaction(supabase, {
      user_telegram_id: ref.referrer_telegram_id,
      amount: bonus,
      type: 'referral',
      description: `Referal signup bonus (#${referredId})`,
      notify: false,
    });
    await request(supabase, 'referrals', {
      method: 'PATCH',
      query: `referred_telegram_id=eq.${referredId}`,
      body: { total_earned: Number(ref.total_earned || 0) + bonus, updated_at: new Date().toISOString() },
    }).catch(() => {});
    await sendMessage(
      ref.referrer_telegram_id,
      `🎉 Do'stingiz raqamini tasdiqladi! +${bonus.toLocaleString('uz-UZ')} UZS balansingizga qo'shildi.`,
    ).catch(() => {});
    return bonus;
  } catch (err) {
    console.warn('referral signup bonus warn:', err?.message);
    return null;
  }
}

module.exports = { processReferralPayout, payReferralSignupBonus };
