// Zaxira kamayganda adminlarni ogohlantirish.
//
// Ikki joydan chaqiriladi: har yetkazishdan keyin (delivery-service) va
// maintenance cron'da (har 5 daqiqa, hamma reja bo'yicha). Bitta reja uchun
// 24 soatda bittadan ko'p xabar ketmaydi — belgisi audit_logs'da
// (action = low_stock_alert, metadata.plan_id).

const { request, toQuery, createAuditLog } = require('./db');
const { notifyAdmins } = require('./admin-notify');
const { escapeHtml } = require('./messages');

const THRESHOLD = Number(process.env.LOW_INVENTORY_THRESHOLD || 3);
const DEDUPE_HOURS = 24;
const ACTION = 'low_stock_alert';
const AUTO_TYPES = ['auto_account', 'license_key'];

// Oxirgi 24 soatda ogohlantirilgan rejalar to'plami.
async function recentlyAlerted(supabase) {
  const since = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await request(supabase, 'audit_logs', {
    query: toQuery({ select: 'metadata', action: `eq.${ACTION}`, created_at: `gte.${since}`, limit: 500 }),
  }).catch(() => ({ data: [] }));
  return new Set((data || []).map((row) => String(row.metadata?.plan_id || '')).filter(Boolean));
}

function alertText(plan, available) {
  return [
    available === 0 ? `📭 <b>Zaxira TUGADI: ${escapeHtml(plan.name)}</b>` : `⚠️ <b>Zaxira kam: ${escapeHtml(plan.name)}</b>`,
    '',
    `Qolgan: <b>${available}</b> ta (chegara: ${THRESHOLD})`,
    available === 0 ? 'Yangi to‘lovlar "zaxira kutilmoqda" holatida qoladi — akkaunt qo‘shing.' : 'Akkaunt qo‘shib qo‘ying, tugab qolmasin.',
    '',
    'Admin panel → Inventory → Ko‘p qatorli import',
  ].join('\n');
}

// Bitta reja uchun (yetkazishdan keyin). alerted berilmasa o'zi o'qiydi.
async function alertLowStock(supabase, { plan, available, alerted }) {
  if (!plan?.id || !AUTO_TYPES.includes(plan.delivery_type || plan.deliveryType)) return false;
  if (Number(available) > THRESHOLD) return false;
  const set = alerted || (await recentlyAlerted(supabase));
  if (set.has(String(plan.id))) return false;
  await notifyAdmins(supabase, alertText(plan, Number(available)));
  await createAuditLog(supabase, {
    action: ACTION,
    status: Number(available) === 0 ? 'out' : 'low',
    metadata: { plan_id: plan.id, plan_name: plan.name, available: Number(available) },
  });
  set.add(String(plan.id));
  return true;
}

// Hamma faol avtomatik rejalar bo'yicha tekshiruv (maintenance cron).
async function checkLowStock(supabase) {
  const [plansRes, invRes, alerted] = await Promise.all([
    request(supabase, 'plans', { query: 'select=id,name,delivery_type&is_active=eq.true&delivery_type=in.(auto_account,license_key)&limit=500' }).catch(() => ({ data: [] })),
    request(supabase, 'inventory_items', { query: 'select=plan_id&status=eq.available&limit=10000' }).catch(() => ({ data: [] })),
    recentlyAlerted(supabase),
  ]);
  const counts = {};
  for (const row of invRes.data || []) counts[row.plan_id] = (counts[row.plan_id] || 0) + 1;
  let sent = 0;
  for (const plan of plansRes.data || []) {
    if (await alertLowStock(supabase, { plan, available: counts[plan.id] || 0, alerted })) sent += 1;
  }
  return sent;
}

module.exports = { alertLowStock, checkLowStock, recentlyAlerted, THRESHOLD };
