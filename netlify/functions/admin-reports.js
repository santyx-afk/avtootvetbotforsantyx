const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient, request, toQuery } = require('../../shared/db');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function safeDate(value) {
  const v = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

// Sana oralig'i (Toshkent kuni) — and=(...) guruhi uchun qismlar
function rangeParts(params) {
  const parts = [];
  const from = safeDate(params.from);
  const to = safeDate(params.to);
  if (from) parts.push(`created_at.gte.${from}T00:00:00+05:00`);
  if (to) parts.push(`created_at.lte.${to}T23:59:59.999+05:00`);
  return parts;
}

async function usersMap(db, ids) {
  const clean = [...new Set(ids.map((id) => String(id || '')).filter((id) => /^\d{1,20}$/.test(id)))];
  if (!clean.length) return new Map();
  const { data } = await request(db, 'users', {
    query: `select=telegram_id,username,full_name&telegram_id=in.(${clean.join(',')})&limit=1000`,
  }).catch(() => ({ data: [] }));
  return new Map((data || []).map((u) => [String(u.telegram_id), u]));
}

const WALLET_TYPES = ['credit', 'debit', 'refund', 'bonus', 'admin_credit', 'admin_debit', 'cashback', 'referral'];
const WALLET_OUT = new Set(['debit', 'admin_debit']);

// Balans harakatlari: oraliq, tur, foydalanuvchi bo'yicha; tur bo'yicha jamlanma.
async function walletReport(db, params) {
  const limit = Math.min(Math.max(Number(params.limit || 300), 1), 2000);
  const query = { select: 'id,user_telegram_id,order_id,amount,type,description,created_at,admin_id', order: 'created_at.desc', limit };
  const parts = rangeParts(params);
  const type = WALLET_TYPES.includes(params.type) ? params.type : '';
  if (type) query.type = `eq.${type}`;
  const user = String(params.user || '').replace(/\D/g, '');
  if (user) query.user_telegram_id = `eq.${user}`;
  if (parts.length) query.and = `(${parts.join(',')})`;

  const { data } = await request(db, 'wallet_transactions', { query: toQuery(query) });
  const rows = data || [];
  const users = await usersMap(db, rows.map((r) => r.user_telegram_id));

  const byType = {};
  for (const t of WALLET_TYPES) byType[t] = { count: 0, sum: 0 };
  let totalIn = 0;
  let totalOut = 0;
  for (const r of rows) {
    const amount = Math.abs(Number(r.amount || 0));
    if (!byType[r.type]) byType[r.type] = { count: 0, sum: 0 };
    byType[r.type].count += 1;
    byType[r.type].sum += amount;
    if (WALLET_OUT.has(r.type)) totalOut += amount;
    else totalIn += amount;
  }
  return {
    items: rows.map((r) => ({ ...r, amount: Number(r.amount), user: users.get(String(r.user_telegram_id)) || { telegram_id: r.user_telegram_id } })),
    summary: { by_type: byType, total_in: totalIn, total_out: totalOut, count: rows.length, truncated: rows.length >= limit },
    types: WALLET_TYPES,
  };
}

// Audit jurnali: kim/nima/qachon. Qidiruv: buyurtma raqami (5 xonali) yoki
// Telegram ID. Debug yozuvlar (business_message_received) sukut bo'yicha yashirin.
async function auditReport(db, params) {
  const limit = Math.min(Math.max(Number(params.limit || 200), 1), 1000);
  const query = { select: 'id,order_id,user_telegram_id,action,status,metadata,created_at', order: 'created_at.desc', limit };
  const parts = rangeParts(params);
  const action = String(params.action || '').replace(/[^a-z_]/g, '');
  if (action) query.action = `eq.${action}`;
  else if (!params.debug) query.action = 'neq.business_message_received';

  const search = String(params.search || '').replace(/\D/g, '');
  if (search) {
    if (search.length <= 6) {
      const { data: found } = await request(db, 'orders', { query: toQuery({ select: 'id', order_number: `eq.${search}`, limit: 1 }) }).catch(() => ({ data: [] }));
      if (!found?.[0]) return { items: [], actions: [], orders: {} };
      query.order_id = `eq.${found[0].id}`;
    } else {
      query.user_telegram_id = `eq.${search}`;
    }
  }
  if (parts.length) query.and = `(${parts.join(',')})`;

  const { data } = await request(db, 'audit_logs', { query: toQuery(query) });
  const rows = data || [];
  const [users, ordersRes] = await Promise.all([
    usersMap(db, rows.map((r) => r.user_telegram_id)),
    (() => {
      const ids = [...new Set(rows.map((r) => r.order_id).filter(Boolean))].slice(0, 500);
      if (!ids.length) return Promise.resolve({ data: [] });
      return request(db, 'orders', { query: toQuery({ select: 'id,order_number', id: `in.(${ids.join(',')})` }) }).catch(() => ({ data: [] }));
    })(),
  ]);
  const orderNumbers = {};
  for (const o of ordersRes.data || []) orderNumbers[o.id] = o.order_number;
  return {
    items: rows.map((r) => ({
      ...r,
      order_number: r.order_id ? orderNumbers[r.order_id] || null : null,
      user: users.get(String(r.user_telegram_id)) || { telegram_id: r.user_telegram_id },
    })),
    actions: [...new Set(rows.map((r) => r.action))].sort(),
  };
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });
  const db = getAdminClient();
  const params = event.queryStringParameters || {};
  try {
    if (params.report === 'wallet' && !requireOwner(event.headers)) return json(403, { ok: false, error: 'Faqat egasi uchun' });
    if (params.report === 'wallet') return json(200, { ok: true, ...(await walletReport(db, params)) });
    if (params.report === 'audit') return json(200, { ok: true, ...(await auditReport(db, params)) });
    return json(400, { ok: false, error: 'report=wallet|audit' });
  } catch (error) {
    console.error('admin-reports error', error);
    return json(500, { ok: false, error: 'Server xatosi' });
  }
};
