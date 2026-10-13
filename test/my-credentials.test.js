const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// "Mening akkauntlarim": yetkazilgan login/parol faqat buyurtma EGASIGA,
// faqat so'ralganda ko'rsatiladi; har ko'rish audit_logs ga yoziladi.
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '123456:test-bot-token';
process.env.INVENTORY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { encryptText } = require('../shared/encryption');
const { signJwt } = require('../shared/webapp-auth');
const { handler } = require('../netlify/functions/webapp-api');

const OWNER = '42';
const STRANGER = '77';
const ORDER = '11111111-1111-4111-8111-111111111111';
const ORDER_PENDING = '22222222-2222-4222-8222-222222222222';
const ORDER_STRANGER = '33333333-3333-4333-8333-333333333333';

const planAcc = { id: 'pa', name: 'ChatGPT Plus', delivery_type: 'auto_account', delivery_instructions: null };
const planKey = { id: 'pk', name: 'Office kalit', delivery_type: 'license_key', delivery_instructions: 'Kalitni kiriting' };

function seed() {
  return {
    users: [{ telegram_id: OWNER, is_blocked: false }, { telegram_id: STRANGER, is_blocked: false }],
    orders: [
      { id: ORDER, order_number: 'A-1', user_telegram_id: OWNER, status: 'completed', delivery_status: 'delivered', order_type: 'purchase', plan_id: 'pa', amount: 1, created_at: '2026-10-01T00:00:00Z' },
      { id: ORDER_PENDING, order_number: 'A-2', user_telegram_id: OWNER, status: 'waiting_payment', delivery_status: null, order_type: 'purchase', plan_id: 'pa', amount: 1, created_at: '2026-10-02T00:00:00Z' },
      { id: ORDER_STRANGER, order_number: 'B-1', user_telegram_id: STRANGER, status: 'completed', delivery_status: 'delivered', order_type: 'purchase', plan_id: 'pa', amount: 1, created_at: '2026-10-01T00:00:00Z' },
    ],
    order_items: [
      { id: 'i1', order_id: ORDER, plan_id: 'pa', quantity: 1, unit_price: 1, plans: planAcc },
      { id: 'i2', order_id: ORDER, plan_id: 'pa', quantity: 1, unit_price: 1, plans: planAcc },
      { id: 'i3', order_id: ORDER, plan_id: 'pk', quantity: 1, unit_price: 1, plans: planKey },
      { id: 'i4', order_id: ORDER_PENDING, plan_id: 'pa', quantity: 1, unit_price: 1, plans: planAcc },
    ],
    inventory_items: [
      { id: 'inv1', plan_id: 'pa', type: 'auto_account', login: 'one@mail', password_encrypted: encryptText('pass-ONE'), status: 'sold', assigned_order_id: ORDER, assigned_user_telegram_id: OWNER, sold_at: '2026-10-01T00:01:00Z' },
      { id: 'inv2', plan_id: 'pa', type: 'auto_account', login: 'two@mail', password_encrypted: encryptText('pass-TWO'), status: 'sold', assigned_order_id: ORDER, assigned_user_telegram_id: OWNER, sold_at: '2026-10-01T00:02:00Z' },
      { id: 'inv3', plan_id: 'pk', type: 'license_key', license_key_encrypted: encryptText('KEY-123'), status: 'sold', assigned_order_id: ORDER, assigned_user_telegram_id: OWNER, sold_at: '2026-10-01T00:03:00Z' },
      { id: 'inv4', plan_id: 'pa', type: 'auto_account', login: 'stranger@mail', password_encrypted: encryptText('pass-S'), status: 'sold', assigned_order_id: ORDER_STRANGER, assigned_user_telegram_id: STRANGER },
    ],
    plans: [planAcc, planKey],
    audit_logs: [],
  };
}

// PostgREST'ning kerakli qismi: eq/in filtrlari, POST (audit), rate_limit RPC.
function installDb({ rateAllowed = true } = {}) {
  const db = seed();
  global.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body });
    if (u.pathname.endsWith('/rpc/rate_limit_hit')) return reply(200, rateAllowed ? { allowed: true } : { allowed: false, retry_after: 600 });
    const table = u.pathname.split('/').pop();
    if (init.method === 'POST') {
      (db[table] || (db[table] = [])).push(JSON.parse(init.body));
      return reply(201, [JSON.parse(init.body)]);
    }
    let rows = db[table] || [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      const [op, ...rest] = v.split('.');
      const val = rest.join('.');
      if (op === 'eq') rows = rows.filter((r) => String(r[k]) === val);
      if (op === 'in') { const set = val.replace(/[()]/g, '').split(','); rows = rows.filter((r) => set.includes(String(r[k]))); }
    }
    return reply(200, rows);
  };
  return db;
}

const call = (telegramId, body) => handler({
  httpMethod: 'POST',
  headers: { authorization: `Bearer ${signJwt({ telegram_id: telegramId })}` },
  body: JSON.stringify(body),
});

test('egasi: login/parol va kalit deshifrlangan holda keladi, audit yoziladi', async () => {
  const db = installDb();
  const res = await call(OWNER, { action: 'my-credentials', orderId: ORDER });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const body = JSON.parse(res.body);
  const accounts = body.deliveries.filter((d) => d.credential?.type === 'account');
  assert.deepEqual(accounts.map((d) => [d.credential.login, d.credential.password]), [['one@mail', 'pass-ONE'], ['two@mail', 'pass-TWO']],
    'bir xil rejadagi ikki dona — ikki xil akkaunt');
  const key = body.deliveries.find((d) => d.credential?.type === 'key');
  assert.equal(key.credential.key, 'KEY-123');
  assert.equal(key.credential.instructions, 'Kalitni kiriting');
  assert.ok(!JSON.stringify(body).includes('stranger@mail'), 'begona akkaunt aralashmaydi');
  const audit = db.audit_logs.filter((a) => a.action === 'credentials_viewed');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].user_telegram_id, OWNER);
});

test('begona foydalanuvchi: 404, hech narsa oshkor bo\'lmaydi', async () => {
  const db = installDb();
  const res = await call(STRANGER, { action: 'my-credentials', orderId: ORDER });
  assert.equal(res.statusCode, 404);
  assert.ok(!res.body.includes('pass-ONE'));
  assert.equal(db.audit_logs.length, 0);
});

test('yetkazilmagan buyurtma: 409; noto\'g\'ri ID: 400; chegara: 429', async () => {
  installDb();
  assert.equal((await call(OWNER, { action: 'my-credentials', orderId: ORDER_PENDING })).statusCode, 409);
  assert.equal((await call(OWNER, { action: 'my-credentials', orderId: 'abc' })).statusCode, 400);
  installDb({ rateAllowed: false });
  assert.equal((await call(OWNER, { action: 'my-credentials', orderId: ORDER })).statusCode, 429);
});

test('tarix: tugma bayrog\'i bor, lekin kredensial yuborilmaydi', async () => {
  installDb();
  const body = JSON.parse((await call(OWNER, { action: 'history' })).body);
  const done = body.orders.find((o) => o.id === ORDER);
  const pending = body.orders.find((o) => o.id === ORDER_PENDING);
  assert.equal(done.can_reveal, true);
  assert.equal(pending.can_reveal, false);
  assert.ok(!JSON.stringify(body).includes('pass-ONE'));
  assert.ok(!('delivery_type' in done.items[0]), 'ichki maydon tashqariga chiqmaydi');
});

test('to\'lovdan keyingi ekran (order-status) ham endi akkauntni ko\'rsatadi', async () => {
  installDb();
  const body = JSON.parse((await call(OWNER, { action: 'order-status', orderId: ORDER })).body);
  assert.equal(body.delivered, true);
  assert.equal(body.deliveries.filter((d) => d.credential?.type === 'account').length, 2);
});
