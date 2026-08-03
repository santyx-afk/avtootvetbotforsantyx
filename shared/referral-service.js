const { request, fetchSettings, addWalletTransaction, createAuditLog } = require('./db');
const { sendMessage } = require('./telegram');

// Buyurtma bajarilganda referrerga bonus beradi:
//  - fix bonus: referal birinchi marta xarid qilganda (status registered -> paid)
//  - foizli bonus: har bir xaridda referrer balansiga qo'shiladi
async function processReferralPayout(supabase, order) {
  try {
    const telegramId = String(order.user_telegram_id);
    const { data } = await request(supabase, 'referrals', {
      query: `select=*&referred_telegram_id=eq.${telegramId}&limit=1`,
    });
    const ref = data?.[0];
    if (!ref) return;

    // Idempotentlik: shu buyurtma uchun referal bonus allaqachon to'langan bo'lsa qaytamiz
    // (payout ham avto-to'lov, ham admin approve yo'lidan chaqirilishi mumkin).
    const prior = await request(supabase, 'audit_logs', {
      query: `select=id&order_id=eq.${order.id}&action=eq.referral_payout&limit=1`,
    }).then((r) => r.data).catch(() => []);
    if (prior && prior[0]) return;

    const settings = await fetchSettings(supabase);
    const referrerId = ref.referrer_telegram_id;
    const orderAmount = Number(order.base_price || order.amount || 0);
    const isFirstPurchase = ref.status === 'registered';

    let accrued = 0;

    // Eslatma: fix (signup) bonus endi bot /start ref_ da beriladi (ro'yxatdan o'tganda).
    // Bu yerda faqat har xarid uchun foizli bonus.

    // Foizli bonus — har bir xarid uchun
    const percent = Number(settings?.referral_percent || 0);
    if (percent > 0 && orderAmount > 0) {
      const percentBonus = Math.floor(orderAmount * percent / 100);
      if (percentBonus > 0) {
        await addWalletTransaction(supabase, {
          user_telegram_id: referrerId,
          order_id: order.id,
          amount: percentBonus,
          type: 'referral',
          description: `Referal ${percent}% (#${telegramId} xaridi)`,
        });
        accrued += percentBonus;
        await sendMessage(referrerId, `🎁 Referalingiz xarid qildi! Balansingizga +${percentBonus.toLocaleString('uz-UZ')} UZS (${percent}%) qo'shildi.`).catch(() => {});
      }
    }

    // Referral yozuvini bitta yangilash bilan yopamiz
    await request(supabase, 'referrals', {
      method: 'PATCH',
      query: `referred_telegram_id=eq.${telegramId}`,
      body: {
        // 'rewarded' — referrals.status CHECK constraint faqat
        // ('registered','rewarded','cancelled') qabul qiladi ('paid' emas).
        status: 'rewarded',
        first_order_id: ref.first_order_id || order.id,
        total_earned: Number(ref.total_earned || 0) + accrued,
        purchase_count: Number(ref.purchase_count || 0) + 1,
        updated_at: new Date().toISOString(),
      },
    }).catch((e) => console.warn('referral update warn:', e?.message));

    await createAuditLog(supabase, {
      order_id: order.id,
      user_telegram_id: telegramId,
      action: 'referral_payout',
      status: 'completed',
      metadata: { referrer: referrerId, percent, accrued, first: isFirstPurchase },
    });
  } catch (err) {
    console.warn('referral payout warn:', err?.message);
  }
}

module.exports = { processReferralPayout };
