const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, fetchSettings, addWalletTransaction } = require('../../shared/db');
const { sendMessage } = require('../../shared/telegram');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Telegram ID lar PostgREST in.(...) filtriga qo'shiladi — faqat raqam o'tadi.
function safeIds(list) {
  return [...new Set(list.filter((id) => /^\d{1,20}$/.test(String(id || ''))))];
}

// Bonus formulasi referral-service.js dagi bilan BIR XIL bo'lishi shart,
// aks holda panel "kutilmoqda" deb bir summani ko'rsatadi-yu, qo'lda to'lash
// boshqa summani to'laydi.
function orderBonus(order, percent) {
  const base = Number(order.base_price || order.amount || 0);
  return percent > 0 && base > 0 ? Math.floor((base * percent) / 100) : 0;
}

// Taklif qilinganlarning haqli (to'langan) buyurtmalari va ulardan qaysilari
// hali bonus olmaganini yig'adi. GET ro'yxati ham, qo'lda to'lash ham shu
// bitta manbadan foydalanadi.
async function collectOrders(db, referredIds, percent) {
  const ids = safeIds(referredIds);
  if (!ids.length) return { byUser: new Map(), paidSet: new Set() };

  const [ordersRes, payoutsRes] = await Promise.all([
    request(db, 'orders', {
      query: `select=id,user_telegram_id,base_price,amount,status,created_at&user_telegram_id=in.(${ids.join(',')})&status=in.(approved,completed,delivered)&order=created_at.asc&limit=5000`,
    }),
    request(db, 'referral_payouts', { query: 'select=order_id' }).catch(() => ({ data: [] })),
  ]);

  const paidSet = new Set((payoutsRes.data || []).map((p) => p.order_id));
  const byUser = new Map();
  for (const order of ordersRes.data || []) {
    const key = String(order.user_telegram_id);
    if (!byUser.has(key)) byUser.set(key, { paid: [], pending: [], last: null });
    const bucket = byUser.get(key);
    if (paidSet.has(order.id)) bucket.paid.push(order);
    else if (orderBonus(order, percent) > 0) bucket.pending.push(order);
    bucket.last = order.created_at;
  }
  return { byUser, paidSet };
}

async function listReferrals(db) {
  const [{ data: refs }, settings] = await Promise.all([
    request(db, 'referrals', { query: 'select=*&order=created_at.desc&limit=1000' }),
    fetchSettings(db).catch(() => null),
  ]);
  const rows = refs || [];
  const percent = Number(settings?.referral_percent || 0);

  const allIds = safeIds(rows.flatMap((r) => [r.referrer_telegram_id, r.referred_telegram_id]));
  let users = [];
  if (allIds.length) {
    ({ data: users } = await request(db, 'users', {
      query: `select=telegram_id,username,full_name&telegram_id=in.(${allIds.join(',')})&limit=2000`,
    }).catch(() => ({ data: [] })));
  }
  const userMap = new Map((users || []).map((u) => [String(u.telegram_id), u]));

  const { byUser } = await collectOrders(db, rows.map((r) => r.referred_telegram_id), percent);

  const items = rows.map((r) => {
    const orders = byUser.get(String(r.referred_telegram_id)) || { paid: [], pending: [], last: null };
    const pendingAmount = r.status === 'cancelled'
      ? 0
      : orders.pending.reduce((s, o) => s + orderBonus(o, percent), 0);
    return {
      id: r.id,
      referrer: userMap.get(String(r.referrer_telegram_id)) || { telegram_id: r.referrer_telegram_id },
      referred: userMap.get(String(r.referred_telegram_id)) || { telegram_id: r.referred_telegram_id },
      referrer_telegram_id: r.referrer_telegram_id,
      referred_telegram_id: r.referred_telegram_id,
      created_at: r.created_at,
      status: r.status,
      purchase_count: Number(r.purchase_count || 0),
      total_earned: Number(r.total_earned || 0),
      paid_orders: orders.paid.length,
      pending_orders: r.status === 'cancelled' ? 0 : orders.pending.length,
      pending_amount: pendingAmount,
      last_order_at: orders.last,
    };
  });

  const summary = {
    total: items.length,
    rewarded: items.filter((i) => i.status === 'rewarded').length,
    cancelled: items.filter((i) => i.status === 'cancelled').length,
    total_earned: items.reduce((s, i) => s + i.total_earned, 0),
    pending_total: items.reduce((s, i) => s + i.pending_amount, 0),
  };

  return json(200, {
    ok: true,
    referrals: items,
    summary,
    percent,
    fixed_bonus: Number(settings?.referral_fixed_bonus || 0),
  });
}

// Bitta referalning to'lanmagan haqli buyurtmalari uchun bonusni qo'lda
// to'laydi. Har bir buyurtma referral_payouts ga da'vo bilan yopiladi —
// avtomat payout bilan parallel kelib qolsa ham ikki marta to'lanmaydi.
async function payPending(db, body) {
  const referredId = String(body.referred_telegram_id || '');
  if (!/^\d{1,20}$/.test(referredId)) return json(400, { ok: false, error: 'referred_telegram_id noto\'g\'ri' });

  const { data: refs } = await request(db, 'referrals', {
    query: `select=*&referred_telegram_id=eq.${referredId}&limit=1`,
  });
  const ref = refs?.[0];
  if (!ref) return json(404, { ok: false, error: 'Referal topilmadi' });
  if (ref.status === 'cancelled') return json(400, { ok: false, error: 'Bekor qilingan referalga bonus to\'lanmaydi' });

  const settings = await fetchSettings(db).catch(() => null);
  const percent = Number(settings?.referral_percent || 0);
  if (percent <= 0) return json(400, { ok: false, error: 'Sozlamalarda referal foizi 0 — avval foizni belgilang' });

  const { byUser } = await collectOrders(db, [referredId], percent);
  const pending = byUser.get(referredId)?.pending || [];
  if (!pending.length) return json(200, { ok: true, paid: 0, amount: 0, message: 'To\'lanmagan buyurtma yo\'q' });

  let paidCount = 0;
  let paidSum = 0;
  for (const order of pending) {
    const bonus = orderBonus(order, percent);
    // Da'vo: allaqachon (masalan avtomat yo'l bilan) to'langan bo'lsa bo'sh qaytadi.
    const { data: claim } = await request(db, 'referral_payouts', {
      method: 'POST',
      query: 'on_conflict=order_id',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: {
        order_id: order.id,
        referrer_telegram_id: ref.referrer_telegram_id,
        referred_telegram_id: referredId,
        amount: bonus,
        kind: 'manual',
        admin_id: 'web_admin',
      },
    });
    if (!claim?.[0]) continue;

    await addWalletTransaction(db, {
      user_telegram_id: ref.referrer_telegram_id,
      order_id: order.id,
      amount: bonus,
      type: 'referral',
      description: `Referal ${percent}% (#${referredId} xaridi, qo'lda)`,
      admin_id: 'web_admin',
      notify: false,
    });
    paidCount += 1;
    paidSum += bonus;
  }

  if (paidCount > 0) {
    await request(db, 'referrals', {
      method: 'PATCH',
      query: `referred_telegram_id=eq.${referredId}`,
      body: {
        status: 'rewarded',
        first_order_id: ref.first_order_id || pending[0].id,
        total_earned: Number(ref.total_earned || 0) + paidSum,
        purchase_count: Number(ref.purchase_count || 0) + paidCount,
        updated_at: new Date().toISOString(),
      },
    }).catch(() => {});
    await sendMessage(
      ref.referrer_telegram_id,
      `🎁 Referal bonuslaringiz to'landi: +${paidSum.toLocaleString('uz-UZ')} UZS (${paidCount} ta xarid uchun).`,
    ).catch(() => {});
  }

  return json(200, { ok: true, paid: paidCount, amount: paidSum });
}

async function setStatus(db, body, status) {
  const referredId = String(body.referred_telegram_id || '');
  if (!/^\d{1,20}$/.test(referredId)) return json(400, { ok: false, error: 'referred_telegram_id noto\'g\'ri' });
  const { data } = await request(db, 'referrals', {
    method: 'PATCH',
    query: `referred_telegram_id=eq.${referredId}`,
    headers: { Prefer: 'return=representation' },
    body: { status, updated_at: new Date().toISOString() },
  });
  if (!data?.[0]) return json(404, { ok: false, error: 'Referal topilmadi' });
  return json(200, { ok: true, referral: data[0] });
}

async function removeReferral(db, body) {
  const referredId = String(body.referred_telegram_id || '');
  if (!/^\d{1,20}$/.test(referredId)) return json(400, { ok: false, error: 'referred_telegram_id noto\'g\'ri' });
  await request(db, 'referrals', { method: 'DELETE', query: `referred_telegram_id=eq.${referredId}` });
  return json(200, { ok: true });
}

// Referal dasturni boshqarish: ro'yxat, qo'lda to'lash, bekor qilish/tiklash, o'chirish.
exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') return await listReferrals(db);

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (body.action === 'pay-pending') return await payPending(db, body);
      if (body.action === 'cancel') return await setStatus(db, body, 'cancelled');
      // Tiklashda xaridlari bo'lganlar 'rewarded' ga qaytadi, qolganlar 'registered'.
      if (body.action === 'reactivate') {
        const { data: refs } = await request(db, 'referrals', {
          query: `select=purchase_count&referred_telegram_id=eq.${String(body.referred_telegram_id || '').replace(/\D/g, '')}&limit=1`,
        }).catch(() => ({ data: [] }));
        const wasRewarded = Number(refs?.[0]?.purchase_count || 0) > 0;
        return await setStatus(db, body, wasRewarded ? 'rewarded' : 'registered');
      }
      if (body.action === 'delete') return await removeReferral(db, body);
      return json(400, { ok: false, error: 'Noma\'lum action' });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('admin-referrals error', error);
    return json(500, { ok: false, error: 'Server xatosi — referral_payouts jadvali yaratilganini tekshiring (migrations/2026-08-26_referral-payouts.sql)' });
  }
};
