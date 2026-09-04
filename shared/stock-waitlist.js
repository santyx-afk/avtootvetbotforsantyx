// "Kelganda xabar ber": tugagan mahsulotga navbat. Foydalanuvchi Mini App'da
// tugmani bosadi (stock_waitlist), inventar qo'shilganda navbatdagilarga bot
// orqali xabar ketadi va yozuv "notified" bo'ladi.

const { request, toQuery, fetchPlan } = require('./db');
const { sendMessage } = require('./telegram');
const { escapeHtml } = require('./messages');

async function isWaiting(supabase, telegramId, planId) {
  const { data } = await request(supabase, 'stock_waitlist', {
    query: toQuery({ select: 'id', user_telegram_id: `eq.${telegramId}`, plan_id: `eq.${planId}`, notified: 'eq.false', limit: 1 }),
  }).catch(() => ({ data: [] }));
  return Boolean(data?.[0]);
}

// Navbatga qo'shish / chiqarish. Qaytaradi: { waiting: boolean }.
async function toggleWaitlist(supabase, telegramId, planId) {
  const { data } = await request(supabase, 'stock_waitlist', {
    query: toQuery({ select: 'id,notified', user_telegram_id: `eq.${telegramId}`, plan_id: `eq.${planId}`, limit: 1 }),
  });
  const row = data?.[0];
  if (row && !row.notified) {
    await request(supabase, 'stock_waitlist', { method: 'DELETE', query: toQuery({ id: `eq.${row.id}` }) });
    return { waiting: false };
  }
  if (row) {
    // Ilgari xabar olgan — qayta navbatga qo'yamiz
    await request(supabase, 'stock_waitlist', { method: 'PATCH', query: toQuery({ id: `eq.${row.id}` }), body: { notified: false, created_at: new Date().toISOString() } });
    return { waiting: true };
  }
  await request(supabase, 'stock_waitlist', {
    method: 'POST',
    query: 'on_conflict=user_telegram_id,plan_id',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: { user_telegram_id: String(telegramId), plan_id: planId, notified: false },
  });
  return { waiting: true };
}

// Reja uchun zaxira paydo bo'lgach navbatdagilarga xabar (inventar
// qo'shilganda chaqiriladi). Zaxira hali yo'q bo'lsa hech narsa qilmaydi.
async function notifyWaitlist(supabase, planId) {
  if (!planId) return 0;
  const [{ data: stock }, { data: waiting }, plan] = await Promise.all([
    request(supabase, 'inventory_items', { query: toQuery({ select: 'id', plan_id: `eq.${planId}`, status: 'eq.available', limit: 1 }) }).catch(() => ({ data: [] })),
    request(supabase, 'stock_waitlist', { query: toQuery({ select: 'id,user_telegram_id', plan_id: `eq.${planId}`, notified: 'eq.false', order: 'created_at.asc', limit: 500 }) }).catch(() => ({ data: [] })),
    fetchPlan(supabase, planId).catch(() => null),
  ]);
  if (!stock?.length || !waiting?.length) return 0;
  const url = (process.env.APP_BASE_URL || 'https://santyx.uz').replace(/\/+$/, '');
  const text = [
    '🔔 <b>Kutgan mahsulotingiz keldi!</b>',
    '',
    `📦 ${escapeHtml(plan?.name || 'Obuna')}`,
    'Zaxira cheklangan — hoziroq buyurtma bering 👇',
  ].join('\n');
  const keyboard = { inline_keyboard: [[{ text: '🚀 Sotib olish', web_app: { url: `${url}/catalog/${planId}` } }]] };
  let sent = 0;
  for (const row of waiting) {
    const ok = await sendMessage(String(row.user_telegram_id), text, keyboard).then(() => true).catch(() => false);
    if (ok) sent += 1;
    // Xabar ketmasa ham navbatdan chiqadi (bot bloklangan bo'lishi mumkin)
    await request(supabase, 'stock_waitlist', { method: 'PATCH', query: toQuery({ id: `eq.${row.id}` }), body: { notified: true } }).catch(() => {});
  }
  return sent;
}

module.exports = { isWaiting, toggleWaitlist, notifyWaitlist };
