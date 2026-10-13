const test = require('node:test');
const assert = require('node:assert/strict');

// Qo'llab-quvvatlash: bot ichidagi murojaat (buyurtma raqami bilan), adminlarga
// nusxa, admin paneldan javob; migratsiyasiz eski havola.
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
process.env.ADMIN_TELEGRAM_IDS = '999';

const { createSession } = require('../shared/auth');
const support = require('../shared/support-service');
const db = require('../shared/db');
const { handler } = require('../netlify/functions/admin-support');

const client = { url: process.env.SUPABASE_URL, key: 'mock' };
const owner = { cookie: `admin_session=${createSession({ role: 'owner' })}` };
const ORDER = '11111111-1111-4111-8111-111111111111';
const OTHER_ORDER = '22222222-2222-4222-8222-222222222222';

// Kerakli PostgREST qismi (eq/neq/gte filtrlar, POST/PATCH, upsert) + Telegram.
function fakeBackend({ hasTable = true, telegramFails = false } = {}) {
  const t = {
    support_messages: [],
    user_states: [],
    orders: [
      { id: ORDER, order_number: 'A-7', status: 'completed', user_telegram_id: '42', order_type: 'purchase', created_at: new Date().toISOString() },
      { id: OTHER_ORDER, order_number: 'B-1', status: 'completed', user_telegram_id: '77', order_type: 'purchase', created_at: new Date().toISOString() },
    ],
    users: [{ telegram_id: '42', username: 'ali', full_name: 'Ali' }],
    settings: [{ id: 1 }],
    telegram: [],
  };
  const filter = (rows, params) => rows.filter((r) => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) return true;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    if (op === 'eq') return String(r[k]) === val;
    if (op === 'neq') return String(r[k]) !== val;
    if (op === 'gte') return String(r[k]) >= val;
    if (op === 'in') return val.replace(/[()]/g, '').split(',').includes(String(r[k]));
    return true;
  }));
  global.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const reply = (status, body, count) => ({
      ok: status < 400, status,
      headers: { get: (h) => (String(h).toLowerCase() === 'content-range' && count != null ? `0-0/${count}` : null) },
      text: async () => JSON.stringify(body), json: async () => body,
    });
    if (u.hostname === 'api.telegram.org') {
      const payload = JSON.parse(init.body || '{}');
      const method = u.pathname.split('/').pop();
      if (telegramFails && method === 'sendMessage') return reply(403, { ok: false, description: 'Forbidden: bot was blocked by the user' });
      t.telegram.push({ method, ...payload });
      return reply(200, { ok: true, result: { message_id: 1 } });
    }
    const table = u.pathname.split('/').pop();
    if (table === 'support_messages' && !hasTable) {
      return reply(404, { code: '42P01', message: 'relation "public.support_messages" does not exist' });
    }
    const rows = t[table] || (t[table] = []);
    const method = init.method || 'GET';
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      if (table === 'user_states') {
        const i = rows.findIndex((r) => r.telegram_id === body.telegram_id);
        if (i >= 0) rows[i] = body; else rows.push(body);
        return reply(201, [body]);
      }
      const row = { id: rows.length + 1, is_read: false, created_at: new Date(Date.now() + rows.length).toISOString(), ...body };
      rows.push(row);
      return reply(201, [row]);
    }
    const matched = filter(rows, u.searchParams);
    if (method === 'PATCH') { const body = JSON.parse(init.body); matched.forEach((r) => Object.assign(r, body)); return reply(200, matched); }
    const sorted = u.searchParams.get('order')?.includes('desc') ? [...matched].reverse() : matched;
    const limit = Number(u.searchParams.get('limit') || 0);
    return reply(200, limit ? sorted.slice(0, limit) : sorted, matched.length);
  };
  return t;
}

const msg = (extra) => ({ message_id: 5, chat: { id: 42, type: 'private' }, from: { id: 42, username: 'ali', first_name: 'Ali' }, ...extra });
const stateOf = (t) => t.user_states.find((r) => r.telegram_id === '42')?.state || {};

test('startSupport: oxirgi buyurtma biriktiriladi; begona buyurtma emas', async () => {
  const t = fakeBackend();
  await support.startSupport({ supabase: client, chatId: 42, telegramId: '42', orderId: OTHER_ORDER });
  assert.equal(stateOf(t).support_mode, true);
  assert.equal(stateOf(t).support_order_id, null, 'boshqa mijozning buyurtmasi biriktirilmaydi');
  await support.startSupport({ supabase: client, chatId: 42, telegramId: '42' });
  assert.equal(stateOf(t).support_order_number, 'A-7');
  assert.match(t.telegram.at(-1).text, /#A-7/);
});

test('murojaat: saqlanadi, adminga nusxa, mijozga tasdiq', async () => {
  const t = fakeBackend();
  await support.startSupport({ supabase: client, chatId: 42, telegramId: '42', orderId: ORDER });
  t.telegram.length = 0;
  const handled = await support.handleSupportMessage({ supabase: client, message: msg({ text: 'Akkaunt ishlamayapti' }) });
  assert.equal(handled, true);
  assert.equal(t.support_messages.length, 1);
  assert.deepEqual(
    { d: t.support_messages[0].direction, text: t.support_messages[0].text, order: t.support_messages[0].order_number },
    { d: 'in', text: 'Akkaunt ishlamayapti', order: 'A-7' },
  );
  const toAdmin = t.telegram.filter((m) => String(m.chat_id) === '999');
  assert.ok(toAdmin.some((m) => m.method === 'sendMessage' && /#A-7/.test(m.text)));
  assert.ok(toAdmin.some((m) => m.method === 'copyMessage'));
  assert.ok(t.telegram.some((m) => String(m.chat_id) === '42' && /yetkazildi/.test(m.text)));
});

test('murojaat rejimi bo\'lmasa / buyruq / promokod / eskirgan — o\'tkazib yuboriladi', async () => {
  const t = fakeBackend();
  assert.equal(await support.handleSupportMessage({ supabase: client, message: msg({ text: 'salom' }) }), false);
  await support.startSupport({ supabase: client, chatId: 42, telegramId: '42' });
  assert.equal(await support.handleSupportMessage({ supabase: client, message: msg({ text: '/balance' }) }), false);
  stateOf(t).awaiting_promo = true;
  assert.equal(await support.handleSupportMessage({ supabase: client, message: msg({ text: 'PROMO10' }) }), false);
  stateOf(t).awaiting_promo = false;
  stateOf(t).support_at = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  assert.equal(await support.handleSupportMessage({ supabase: client, message: msg({ text: 'kech' }) }), false);
  assert.equal(stateOf(t).support_mode, false);
  assert.equal(t.support_messages.length, 0);
});

test('yangi to\'lov boshlansa murojaat rejimi yopiladi (chek murojaatga tushmasin)', async () => {
  const t = fakeBackend();
  await support.startSupport({ supabase: client, chatId: 42, telegramId: '42' });
  await db.setUserAwaitingReceipt(client, '42', { current_order_id: ORDER });
  assert.equal(stateOf(t).support_mode, false);
  assert.equal(stateOf(t).awaiting_receipt, true);
});

test('migratsiya yo\'q: bot eski havolani beradi, rejimga o\'tmaydi', async () => {
  const t = fakeBackend({ hasTable: false });
  const ok = await support.startSupport({ supabase: client, chatId: 42, telegramId: '42' });
  assert.equal(ok, false);
  assert.equal(stateOf(t).support_mode, undefined);
  assert.ok(t.telegram.at(-1).reply_markup.inline_keyboard[0][0].url);
  const list = JSON.parse((await handler({ httpMethod: 'GET', headers: owner, queryStringParameters: {} })).body);
  assert.equal(list.migrationMissing, true);
});

test('panel: ro\'yxat, o\'qilmaganlar, suhbat ochilganda o\'qildi, javob mijozga boradi', async () => {
  const t = fakeBackend();
  t.support_messages.push(
    { id: 1, user_telegram_id: '42', direction: 'in', text: 'savol 1', order_number: 'A-7', order_id: ORDER, is_read: false, created_at: '2026-10-12T10:00:00Z' },
    { id: 2, user_telegram_id: '42', direction: 'in', text: 'savol 2', order_number: 'A-7', order_id: ORDER, is_read: false, created_at: '2026-10-12T10:01:00Z' },
  );
  const count = JSON.parse((await handler({ httpMethod: 'GET', headers: owner, queryStringParameters: { count: '1' } })).body);
  assert.equal(count.unread, 2);
  const list = JSON.parse((await handler({ httpMethod: 'GET', headers: owner, queryStringParameters: {} })).body);
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0].unread, 2);
  assert.equal(list.conversations[0].order_number, 'A-7');
  assert.equal(list.conversations[0].user.username, 'ali');

  const thread = JSON.parse((await handler({ httpMethod: 'GET', headers: owner, queryStringParameters: { user_id: '42' } })).body);
  assert.deepEqual(thread.messages.map((m) => m.text), ['savol 1', 'savol 2']);
  assert.ok(t.support_messages.every((m) => m.is_read), 'ochilgach o\'qilgan');

  const res = await handler({ httpMethod: 'POST', headers: owner, body: JSON.stringify({ telegram_id: '42', text: 'Tekshiramiz <b>' }) });
  assert.equal(res.statusCode, 200);
  const sent = t.telegram.find((m) => String(m.chat_id) === '42');
  assert.match(sent.text, /Admin javobi/);
  assert.match(sent.text, /&lt;b&gt;/, 'admin matni HTML-escape qilinadi');
  const out = t.support_messages.find((m) => m.direction === 'out');
  assert.equal(out.admin_name, 'Egasi');
  assert.equal(out.order_number, 'A-7');
});

test('panel: mijoz botni bloklagan — tushunarli xato, tarixga yozilmaydi', async () => {
  const t = fakeBackend({ telegramFails: true });
  t.support_messages.push({ id: 1, user_telegram_id: '42', direction: 'in', text: 'x', is_read: true, created_at: '2026-10-12T10:00:00Z' });
  const res = await handler({ httpMethod: 'POST', headers: owner, body: JSON.stringify({ telegram_id: '42', text: 'javob' }) });
  assert.equal(res.statusCode, 502);
  assert.equal(t.support_messages.filter((m) => m.direction === 'out').length, 0);
  assert.equal((await handler({ httpMethod: 'POST', headers: owner, body: JSON.stringify({ telegram_id: '42', text: '  ' }) })).statusCode, 400);
});

test('panel: avtorizatsiyasiz — 401', async () => {
  fakeBackend();
  assert.equal((await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: {} })).statusCode, 401);
});
