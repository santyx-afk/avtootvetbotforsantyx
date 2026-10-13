const test = require('node:test');
const assert = require('node:assert/strict');

// Supabase (PostgREST max-rows) bitta so'rovda eng ko'pi 1000 qator qaytaradi.
// Ilgari admin-users `limit=5000` so'rardi va 1000-dan keyingi foydalanuvchilar
// panelda ko'rinmas, qidiruvda chiqmas, balansi ham 0 ko'rinardi.
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const { createSession } = require('../shared/auth');
const { handler } = require('../netlify/functions/admin-users');

const headers = { cookie: `admin_session=${createSession({ role: 'owner' })}` };

function installMock(tables, serverMaxRows = 1000) {
  global.fetch = async (url) => {
    const u = new URL(String(url));
    const table = u.pathname.split('/').pop();
    const rows = tables[table] || [];
    const limit = Math.min(Number(u.searchParams.get('limit') || serverMaxRows), serverMaxRows);
    const offset = Number(u.searchParams.get('offset') || 0);
    const page = rows.slice(offset, offset + limit);
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(page) };
  };
}

test('admin-users: 1000+ foydalanuvchi ham to\'liq keladi, balansi bilan', async () => {
  const users = Array.from({ length: 2500 }, (_, i) => ({
    telegram_id: String(i + 1),
    phone: i % 2 ? '+998900000000' : null,
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
  }));
  const wallets = users.map((u) => ({ user_telegram_id: u.telegram_id, balance: 100 }));
  const orders = Array.from({ length: 1500 }, (_, i) => ({
    user_telegram_id: '7', order_type: 'purchase', status: 'completed', base_price: 10000, discount_amount: 1000,
    created_at: new Date(Date.UTC(2026, 1, 1) + i * 1000).toISOString(),
  }));
  installMock({ users, user_wallets: wallets, orders }, 1000);

  const res = await handler({ httpMethod: 'GET', headers, queryStringParameters: {} });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.users.length, 2500, 'hamma foydalanuvchi kelishi kerak');
  assert.equal(body.users[0].telegram_id, '2500', 'eng yangisi tepada');

  const last = body.users.find((u) => u.telegram_id === '2400');
  assert.equal(last.balance, 100, '1000-dan keyingi hamyon balansi ham ko\'rinadi');

  const buyer = body.users.find((u) => u.telegram_id === '7');
  assert.equal(buyer.purchases, 1500, 'xaridlar soni 1000 bilan kesilmaydi');
  assert.equal(buyer.total_spent, 1500 * 9000, 'jami sarflagan: base_price − chegirma, hammasi');
  assert.equal(buyer.last_activity, orders[orders.length - 1].created_at, 'oxirgi faollik — eng yangi buyurtma');
});

test('admin-users: jami sarflagan faqat to\'langan xaridlardan', async () => {
  const users = [{ telegram_id: '1', phone: '+998901234567', created_at: '2026-01-01T00:00:00Z' }];
  const at = '2026-02-01T00:00:00Z';
  const orders = [
    { user_telegram_id: '1', order_type: 'purchase', status: 'completed', base_price: 50000, discount_amount: 5000, created_at: at },
    { user_telegram_id: '1', order_type: 'purchase', status: 'approved', amount: 20000, created_at: at }, // base_price yo'q — amount
    { user_telegram_id: '1', order_type: 'purchase', status: 'expired', base_price: 99000, created_at: at }, // to'lanmagan
    { user_telegram_id: '1', order_type: 'purchase', status: 'rejected', base_price: 99000, created_at: at },
    { user_telegram_id: '1', order_type: 'topup', status: 'completed', amount: 100000, created_at: at }, // to'ldirish — xarid emas
  ];
  installMock({ users, user_wallets: [], orders });

  const list = JSON.parse((await handler({ httpMethod: 'GET', headers, queryStringParameters: {} })).body);
  assert.equal(list.users[0].total_spent, 65000);
  assert.equal(list.users[0].purchases, 2, 'muddati o\'tgan/rad etilgan xarid sanalmaydi');

  const detail = JSON.parse((await handler({ httpMethod: 'GET', headers, queryStringParameters: { user_id: '1' } })).body);
  assert.equal(detail.total_spent, 65000);
  assert.equal(detail.paid_purchases, 2);
});
