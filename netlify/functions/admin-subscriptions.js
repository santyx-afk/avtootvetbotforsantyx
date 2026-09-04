const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient, request, toQuery, createAuditLog } = require('../../shared/db');
const { sendMessage } = require('../../shared/telegram');
const { escapeHtml } = require('../../shared/messages');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const COLS = 'id,order_id,user_telegram_id,plan_id,plan_name,status,started_at,expires_at,reminder_3d_sent,reminder_1d_sent,expired_notified,created_at';

function tashkentDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Ro'yxat: faol / 7 kun ichida tugaydigan / tugagan / hammasi.
async function listSubscriptions(db, filter) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const in7d = new Date(now + 7 * DAY_MS).toISOString();
  const query = { select: COLS, order: 'expires_at.asc', limit: 500 };
  if (filter === 'active') {
    query.status = 'eq.active';
    query.expires_at = `gte.${nowIso}`;
  } else if (filter === 'expiring') {
    query.status = 'eq.active';
    query.and = `(expires_at.gte.${nowIso},expires_at.lte.${in7d})`;
  } else if (filter === 'expired') {
    query.or = `(status.eq.expired,expires_at.lt.${nowIso})`;
    query.order = 'expires_at.desc';
  } else {
    query.order = 'created_at.desc';
  }

  const [{ data: rows }, { data: allRows }] = await Promise.all([
    request(db, 'subscriptions', { query: toQuery(query) }),
    request(db, 'subscriptions', { query: 'select=status,expires_at&limit=5000' }).catch(() => ({ data: [] })),
  ]);
  const subs = rows || [];

  const ids = [...new Set(subs.map((s) => String(s.user_telegram_id || '')).filter((id) => /^\d{1,20}$/.test(id)))];
  let users = [];
  if (ids.length) {
    ({ data: users } = await request(db, 'users', {
      query: `select=telegram_id,username,full_name,phone&telegram_id=in.(${ids.join(',')})&limit=1000`,
    }).catch(() => ({ data: [] })));
  }
  const userMap = new Map((users || []).map((u) => [String(u.telegram_id), u]));

  const items = subs.map((s) => {
    const exp = s.expires_at ? new Date(s.expires_at).getTime() : null;
    const daysLeft = exp ? Math.ceil((exp - now) / DAY_MS) : null;
    return {
      ...s,
      user: userMap.get(String(s.user_telegram_id)) || { telegram_id: s.user_telegram_id },
      days_left: daysLeft,
      is_expired: s.status !== 'active' || (exp !== null && exp < now),
    };
  });

  const summary = { active: 0, expiring_7d: 0, expired: 0 };
  for (const s of allRows || []) {
    const exp = s.expires_at ? new Date(s.expires_at).getTime() : null;
    if (s.status === 'active' && (exp === null || exp >= now)) {
      summary.active += 1;
      if (exp !== null && exp <= now + 7 * DAY_MS) summary.expiring_7d += 1;
    } else summary.expired += 1;
  }
  return { items, summary };
}

async function getSub(db, id) {
  const { data } = await request(db, 'subscriptions', { query: toQuery({ select: COLS, id: `eq.${id}`, limit: 1 }) });
  return data?.[0] || null;
}

// Obunani N kunga uzaytirish: tugagan bo'lsa bugundan, faol bo'lsa
// tugash sanasidan hisoblanadi; eslatma belgilari tozalanadi.
async function extendSubscription(db, { id, days, notify }) {
  const sub = await getSub(db, id);
  if (!sub) return json(404, { ok: false, error: 'Obuna topilmadi' });
  const add = Math.round(Number(days || 0));
  if (!(add > 0 && add <= 3650)) return json(400, { ok: false, error: 'Kunlar soni 1 dan 3650 gacha bo‘lishi kerak' });
  const now = Date.now();
  const base = Math.max(now, sub.expires_at ? new Date(sub.expires_at).getTime() : now);
  const expiresAt = new Date(base + add * DAY_MS).toISOString();
  const { data } = await request(db, 'subscriptions', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${id}` }),
    headers: { Prefer: 'return=representation' },
    body: {
      expires_at: expiresAt,
      status: 'active',
      reminder_3d_sent: false,
      reminder_1d_sent: false,
      expired_notified: false,
      updated_at: new Date().toISOString(),
    },
  });
  await createAuditLog(db, {
    order_id: sub.order_id || null,
    user_telegram_id: sub.user_telegram_id,
    action: 'subscription_extended',
    status: 'active',
    metadata: { subscription_id: id, days: add, expires_at: expiresAt },
  });
  let notified = false;
  if (notify !== false && sub.user_telegram_id) {
    notified = await sendMessage(
      String(sub.user_telegram_id),
      [
        '✅ <b>Obunangiz uzaytirildi!</b>',
        '',
        `📦 ${escapeHtml(sub.plan_name || 'Obuna')}`,
        `➕ ${add} kun`,
        `📅 Yangi muddat: ${escapeHtml(tashkentDate(expiresAt))} (Toshkent)`,
      ].join('\n'),
      null,
    ).then(() => true).catch(() => false);
  }
  return json(200, { ok: true, subscription: data?.[0] || null, notified });
}

async function cancelSubscription(db, { id }) {
  const sub = await getSub(db, id);
  if (!sub) return json(404, { ok: false, error: 'Obuna topilmadi' });
  const { data } = await request(db, 'subscriptions', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${id}` }),
    headers: { Prefer: 'return=representation' },
    body: { status: 'cancelled', updated_at: new Date().toISOString() },
  });
  await createAuditLog(db, { order_id: sub.order_id || null, user_telegram_id: sub.user_telegram_id, action: 'subscription_cancelled', status: 'cancelled', metadata: { subscription_id: id } });
  return json(200, { ok: true, subscription: data?.[0] || null });
}

// Eslatmani hozir yuborish (cron kutmasdan).
async function remindSubscription(db, { id }) {
  const sub = await getSub(db, id);
  if (!sub) return json(404, { ok: false, error: 'Obuna topilmadi' });
  if (!sub.user_telegram_id) return json(400, { ok: false, error: 'Foydalanuvchi ID yo‘q' });
  const daysLeft = sub.expires_at ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / DAY_MS) : null;
  const text = [
    daysLeft !== null && daysLeft <= 0 ? '❌ <b>Obunangiz tugadi</b>' : `⏰ <b>Obunangiz ${daysLeft} kunda tugaydi</b>`,
    '',
    `📦 ${escapeHtml(sub.plan_name || 'Obuna')}`,
    sub.expires_at ? `📅 Tugash: ${escapeHtml(tashkentDate(sub.expires_at))}` : null,
    '',
    'Uzaytirish uchun Mini ilovani oching 👇',
  ].filter((l) => l !== null).join('\n');
  const url = (process.env.APP_BASE_URL || 'https://santyx.uz').replace(/\/+$/, '');
  try {
    await sendMessage(String(sub.user_telegram_id), text, { inline_keyboard: [[{ text: '🚀 Mini ilovani ochish', web_app: { url } }]] });
  } catch (error) {
    return json(502, { ok: false, error: `Yuborib bo‘lmadi: ${error.message}` });
  }
  return json(200, { ok: true });
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const filter = String(event.queryStringParameters?.filter || 'active');
      const result = await listSubscriptions(db, filter);
      return json(200, { ok: true, ...result });
    }
    if (event.httpMethod === 'POST' && !requireOwner(event.headers)) return json(403, { ok: false, error: 'Faqat egasi uchun' });
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const id = String(body.id || '').replace(/[^0-9a-zA-Z-]/g, '');
      if (!id) return json(400, { ok: false, error: 'id talab qilinadi' });
      if (body.action === 'extend') return await extendSubscription(db, { id, days: body.days, notify: body.notify });
      if (body.action === 'cancel') return await cancelSubscription(db, { id });
      if (body.action === 'remind') return await remindSubscription(db, { id });
      return json(400, { ok: false, error: 'Noma’lum action' });
    }
    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('admin-subscriptions error', error);
    return json(500, { ok: false, error: 'Server xatosi' });
  }
};
