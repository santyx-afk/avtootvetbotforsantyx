const test = require('node:test');
const assert = require('node:assert/strict');

// Guruhga balans qo'shish: segment/teg bo'yicha ro'yxat, oldindan sanash,
// credit_users RPC (bitta tranzaksiya) va takroriy bosish himoyasi.
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = 'mock-token';

const { createSession } = require('../shared/auth');
const { handler } = require('../netlify/functions/admin-users');

const owner = { cookie: `admin_session=${createSession({ role: 'owner' })}` };
const operator = { cookie: `admin_session=${createSession({ role: 'operator', username: 'ali' })}` };

const users = [
  { telegram_id: '1', is_blocked: false, tags: ['vip'], created_at: '2026-01-01T00:00:00Z' },
  { telegram_id: '2', is_blocked: false, tags: [], created_at: '2026-01-02T00:00:00Z' },
  { telegram_id: '3', is_blocked: false, tags: ['vip'], created_at: '2026-01-03T00:00:00Z' },
];
const orders = [
  { user_telegram_id: '1', order_type: 'purchase', status: 'completed', created_at: '2026-02-01T00:00:00Z' },
  { user_telegram_id: '3', order_type: 'purchase', status: 'completed', created_at: '2026-02-01T00:00:00Z' },
];

// rpc: (body) => { status, body } — credit_users javobini boshqaradi
function installMock({ rpc } = {}) {
  const calls = { rpc: [], telegram: 0, urls: [] };
  global.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.urls.push(u);
    const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body });
    if (u.hostname === 'api.telegram.org') { calls.telegram += 1; return reply(200, { ok: true, result: { message_id: 1 } }); }
    if (u.pathname.endsWith('/rpc/credit_users')) {
      const body = JSON.parse(init.body);
      calls.rpc.push(body);
      const r = rpc ? rpc(body) : { status: 200, body: body.p_ids.length };
      return reply(r.status, r.body);
    }
    const table = u.pathname.split('/').pop();
    let rows = table === 'users' ? users : table === 'orders' ? orders : [];
    // Teg filtri (tags=cs.{"vip"}) — haqiqiy PostgREST kabi
    const cs = u.searchParams.get('tags');
    if (table === 'users' && cs) {
      const tag = JSON.parse(cs.slice(3).replace(/^\{/, '[').replace(/\}$/, ']'))[0];
      rows = rows.filter((r) => r.tags.includes(tag));
    }
    const offset = Number(u.searchParams.get('offset') || 0);
    return reply(200, offset ? [] : rows);
  };
  return calls;
}

const post = (headers, body) => handler({ httpMethod: 'POST', headers, body: JSON.stringify({ action: 'credit-segment', ...body }) });

test('credit-segment: preview — segment va teg bo\'yicha sanaydi', async () => {
  installMock();
  const buyers = JSON.parse((await post(owner, { segment: 'buyers', preview: true })).body);
  assert.equal(buyers.count, 2);
  const vip = JSON.parse((await post(owner, { segment: 'tag', tag: 'VIP', preview: true })).body);
  assert.equal(vip.count, 2);
  assert.equal(vip.label, 'Teg: vip');
});

test('credit-segment: RPC ga aynan guruh ro\'yxati va request_id ketadi', async () => {
  const calls = installMock();
  const res = await post(owner, { segment: 'tag', tag: 'vip', amount: 5000, reason: 'Bayram', request_id: 'req-12345678' });
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.rpc.length, 1);
  assert.deepEqual(calls.rpc[0].p_ids.sort(), ['1', '3']);
  assert.equal(calls.rpc[0].p_amount, 5000);
  assert.equal(calls.rpc[0].p_request_id, 'req-12345678');
  assert.match(calls.rpc[0].p_description, /Teg: vip.*Bayram/);
  assert.equal(body.credited, 2);
  assert.match(body.message, /jami 10/);
  assert.equal(calls.telegram, 2, 'har biriga xabar');
});

test('credit-segment: takroriy request_id — 409, pul qo\'shilmaydi', async () => {
  installMock({
    rpc: () => ({ status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "admin_bulk_credits_pkey"' } }),
  });
  const res = await post(owner, { segment: 'buyers', amount: 1000, request_id: 'req-12345678' });
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /allaqachon bajarilgan/);
});

test('credit-segment: migratsiya yo\'q — tushunarli xato', async () => {
  installMock({ rpc: () => ({ status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.credit_users' } }) });
  const res = await post(owner, { segment: 'buyers', amount: 1000, request_id: 'req-12345678' });
  assert.equal(res.statusCode, 500);
  assert.match(JSON.parse(res.body).error, /2026-10-12_credit-users\.sql/);
});

test('credit-segment: himoya — operator, noto\'g\'ri guruh/teg/ID, bo\'sh guruh', async () => {
  const calls = installMock();
  assert.equal((await post(operator, { segment: 'buyers', amount: 1000, request_id: 'req-12345678' })).statusCode, 403);
  assert.equal((await post(owner, { segment: 'all', amount: 1000, request_id: 'req-12345678' })).statusCode, 400, '"hamma" — credit-all orqali');
  assert.equal((await post(owner, { segment: 'nope', amount: 1000, request_id: 'req-12345678' })).statusCode, 400);
  assert.equal((await post(owner, { segment: 'tag', tag: 'a}b', amount: 1000, request_id: 'req-12345678' })).statusCode, 400);
  assert.equal((await post(owner, { segment: 'buyers', amount: 1000, request_id: 'x' })).statusCode, 400);
  assert.equal((await post(owner, { segment: 'buyers', amount: 0, request_id: 'req-12345678' })).statusCode, 400);
  assert.equal((await post(owner, { segment: 'tag', tag: 'yoq', amount: 1000, request_id: 'req-12345678' })).statusCode, 400, 'bo\'sh guruh');
  assert.equal(calls.rpc.length, 0, 'hech biri RPC ga yetmasligi kerak');
});
