const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const { createSession } = require('../shared/auth');
const dashboard = require('../netlify/functions/admin-dashboard.js');
const adminData = require('../netlify/functions/admin-data.js');

const { _summarizeProfit: summarizeProfit } = dashboard;

const plans = [
  { id: 'p1', name: 'ChatGPT Plus', price: 100000, cost_price: 60000 },
  { id: 'p2', name: 'Canva Pro', price: 40000, cost_price: 10000 },
  { id: 'p3', name: 'Tannarxsiz', price: 30000, cost_price: null },
];

test('summarizeProfit: bitta tovarli buyurtma — sotuv − tannarx', () => {
  const orders = [
    { id: 'o1', order_type: 'purchase', status: 'completed', base_price: 100000, discount_amount: 10000, plan_id: 'p1', created_at: '2026-09-01T05:00:00Z' },
    { id: 'o2', order_type: 'purchase', status: 'expired', base_price: 100000, plan_id: 'p1', created_at: '2026-09-01T05:00:00Z' }, // to'lanmagan
    { id: 'o3', order_type: 'topup', status: 'completed', amount: 50000, created_at: '2026-09-01T05:00:00Z' }, // xarid emas
  ];
  const p = summarizeProfit(orders, [], plans);
  assert.equal(p.cost, 60000);
  assert.equal(p.profit, 30000); // 90 000 − 60 000
  assert.equal(p.margin, 33);
  assert.equal(p.missingCostSales, 0);
  assert.equal(p.plansProfit.length, 1);
  assert.deepEqual(
    { name: p.plansProfit[0].name, sold: p.plansProfit[0].sold, revenue: p.plansProfit[0].revenue, profit: p.plansProfit[0].profit },
    { name: 'ChatGPT Plus', sold: 1, revenue: 90000, profit: 30000 },
  );
  assert.equal(p.dailyProfit['2026-09-01'], 30000);
});

test('summarizeProfit: savatdagi bir nechta tovar — tannarx har element bo\'yicha', () => {
  const orders = [
    // 100 000 + 40 000 + 40 000 = 180 000, 18 000 chegirma → sotuv 162 000
    { id: 'o1', order_type: 'purchase', status: 'approved', base_price: 180000, discount_amount: 18000, plan_id: 'p1', created_at: '2026-09-02T05:00:00Z' },
  ];
  const items = [
    { order_id: 'o1', plan_id: 'p1', quantity: 1, unit_price: 100000 },
    { order_id: 'o1', plan_id: 'p2', quantity: 1, unit_price: 40000 },
    { order_id: 'o1', plan_id: 'p2', quantity: 1, unit_price: 40000 },
  ];
  const p = summarizeProfit(orders, items, plans);
  assert.equal(p.cost, 60000 + 10000 + 10000);
  assert.equal(p.profit, 162000 - 80000);
  const canva = p.plansProfit.find((r) => r.id === 'p2');
  assert.equal(canva.sold, 2);
  assert.equal(canva.revenue, 72000); // 162 000 × 80/180
  assert.equal(canva.cost, 20000);
});

test('summarizeProfit: tannarxi kiritilmagan reja sanaladi va belgilanadi', () => {
  const orders = [
    { id: 'o1', order_type: 'purchase', status: 'completed', base_price: 30000, plan_id: 'p3', created_at: '2026-09-02T05:00:00Z' },
  ];
  const p = summarizeProfit(orders, [], plans);
  assert.equal(p.missingCostSales, 1);
  assert.equal(p.profit, 30000);
  assert.equal(p.plansProfit[0].hasCost, false);
});

// --- Handler darajasida: sahifalash va rol bo'yicha ko'rinish ---
function installMock(tables, serverMaxRows = 1000) {
  global.fetch = async (url) => {
    const u = new URL(String(url));
    const table = u.pathname.split('/').pop();
    const rows = tables[table] || [];
    const hasLimit = u.searchParams.has('limit');
    const limit = Math.min(Number(u.searchParams.get('limit') || serverMaxRows), serverMaxRows);
    const offset = Number(u.searchParams.get('offset') || 0);
    const page = hasLimit || rows.length > serverMaxRows ? rows.slice(offset, offset + limit) : rows;
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => (String(h).toLowerCase() === 'content-range' ? `0-0/${rows.length}` : null) },
      text: async () => JSON.stringify(page),
    };
  };
}

const ownerHeaders = { cookie: `admin_session=${createSession({ role: 'owner' })}` };
const operatorHeaders = { cookie: `admin_session=${createSession({ role: 'operator', username: 'ali' })}` };

test('dashboard: 1000+ buyurtma to\'liq hisoblanadi; foyda faqat egasiga', async () => {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  const orders = Array.from({ length: 2300 }, (_, i) => ({
    id: `o${i}`, order_type: 'purchase', status: 'completed', base_price: 100000, discount_amount: 0,
    plan_id: 'p1', user_telegram_id: String(i), created_at: `${day}T00:00:00+05:00`,
  }));
  installMock({ orders, plans, categories: [], inventory_items: [], order_items: [], analytics_events: [], referrals: [], users: [] });

  const res = await dashboard.handler({ httpMethod: 'GET', headers: ownerHeaders, queryStringParameters: { from: day, to: day } });
  assert.equal(res.statusCode, 200);
  const { stats } = JSON.parse(res.body);
  assert.equal(stats.sales, 2300 * 100000, 'tushum 1000 bilan kesilmaydi');
  assert.equal(stats.profit.profit, 2300 * 40000);
  assert.equal(stats.dailyRevenue.find((d) => d.iso === day).profit, 2300 * 40000);

  const opRes = await dashboard.handler({ httpMethod: 'GET', headers: operatorHeaders, queryStringParameters: { from: day, to: day } });
  assert.equal(JSON.parse(opRes.body).stats.profit, null, 'operator foydani ko\'rmaydi');
});

test('admin-data: tannarx operatorga yuborilmaydi', async () => {
  installMock({ plans, categories: [], promo_codes: [] });
  const owner = JSON.parse((await adminData.handler({ httpMethod: 'GET', headers: ownerHeaders })).body);
  assert.equal(owner.plans[0].cost_price, 60000);
  const op = JSON.parse((await adminData.handler({ httpMethod: 'GET', headers: operatorHeaders })).body);
  assert.equal('cost_price' in op.plans[0], false);
});

test('admin-data: migratsiya qo\'llanmagan bo\'lsa reja tannarxsiz saqlanadi', async () => {
  const bodies = [];
  global.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'PATCH') {
      bodies.push(body);
      if ('cost_price' in body) {
        return { ok: false, status: 400, headers: { get: () => null }, text: async () => '{"code":"PGRST204","message":"Could not find the \'cost_price\' column of \'plans\' in the schema cache"}' };
      }
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify([{ id: 'p1', ...body }]) };
    }
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => '[]' };
  };
  const res = await adminData.handler({
    httpMethod: 'PUT',
    headers: ownerHeaders,
    body: JSON.stringify({ type: 'plan', item: { id: 'p1', name: 'X', cost_price: 5000 } }),
  });
  const out = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.match(out.warning, /2026-10-12_plans-cost-price/);
  assert.equal(bodies.length, 2);
  assert.equal('cost_price' in bodies[1], false);
});

test('admin-data: manfiy tannarx rad etiladi', async () => {
  installMock({ plans });
  const res = await adminData.handler({
    httpMethod: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ type: 'plan', item: { name: 'X', price: 100, cost_price: -5 } }),
  });
  assert.equal(res.statusCode, 400);
});
