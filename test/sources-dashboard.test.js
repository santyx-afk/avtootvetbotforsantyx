const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const { _summarizeSources: summarizeSources } = require('../netlify/functions/admin-dashboard.js');

const users = [
  { source: 'reels_01' }, { source: 'reels_01' }, { source: 'reels_01' }, { source: 'reels_01' },
  { source: 'instagram_bio' }, { source: 'instagram_bio' },
  { source: null }, { source: null },
];

const orders = [
  // reels_01: 2 ta to'langan, 1 tasi to'lanmagan
  { id: 'o1', source: 'reels_01', order_type: 'purchase', status: 'completed', base_price: 100000, discount_amount: 0 },
  { id: 'o2', source: 'reels_01', order_type: 'purchase', status: 'approved', base_price: 60000, discount_amount: 10000 },
  { id: 'o3', source: 'reels_01', order_type: 'purchase', status: 'expired', base_price: 50000 },
  // instagram_bio: 1 ta to'langan
  { id: 'o4', source: 'instagram_bio', order_type: 'purchase', status: 'completed', base_price: 40000 },
  // manbasiz
  { id: 'o5', source: null, order_type: 'purchase', status: 'completed', base_price: 30000 },
  // balans to'ldirish — sotuv emas, hisobga kirmaydi
  { id: 'o6', source: 'reels_01', order_type: 'topup', status: 'completed', amount: 500000 },
];

test('summarizeSources: manba kesimida foydalanuvchi, buyurtma, tushum', () => {
  const out = summarizeSources(users, orders);
  const byKey = Object.fromEntries(out.rows.map((r) => [r.slug || 'none', r]));

  assert.equal(byKey.reels_01.users, 4);
  assert.equal(byKey.reels_01.ordersCreated, 3, 'topup sanalmaydi');
  assert.equal(byKey.reels_01.ordersPaid, 2);
  assert.equal(byKey.reels_01.revenue, 150000, '100 000 + (60 000 − 10 000)');
  assert.equal(byKey.reels_01.avgCheck, 75000);
  assert.equal(byKey.reels_01.conversion, 50, '2 ta xarid / 4 ta yangi');
  assert.equal(byKey.reels_01.label, 'Reels #01');
  assert.equal(byKey.reels_01.kind, 'reels');

  assert.equal(byKey.instagram_bio.users, 2);
  assert.equal(byKey.instagram_bio.ordersPaid, 1);

  assert.equal(byKey.none.users, 2);
  assert.equal(byKey.none.label, 'Manbasi yo‘q');
});

test('summarizeSources: tushum bo\'yicha saralanadi va Reels alohida chiqadi', () => {
  const out = summarizeSources(users, orders);
  assert.equal(out.rows[0].slug, 'reels_01', 'eng ko‘p pul keltirgan birinchi');
  assert.equal(out.reels.length, 1);
  assert.equal(out.reels[0].slug, 'reels_01');
  assert.equal(out.totals.users, 8);
  assert.equal(out.totals.known, 6, 'manbasizlar "aniq" hisobiga kirmaydi');
  assert.equal(out.totals.revenue, 220000);
});

test('summarizeSources: lug\'atdagi nom slug o\'rniga ishlatiladi', () => {
  const out = summarizeSources(users, orders, { reels_01: { label: 'Reels: 3 ta montaj xatosi' } });
  assert.equal(out.rows.find((r) => r.slug === 'reels_01').label, 'Reels: 3 ta montaj xatosi');
});

test('summarizeSources: foydalanuvchisiz manba — konversiya null, qator yo\'qolmaydi', () => {
  // Mijoz o'tgan oyda ro'yxatdan o'tib, shu oyda xarid qilgan: "yangi" yo'q,
  // lekin buyurtma bor. Bunday qator ko'rinishi SHART, aks holda manba
  // keltirgan pul hisobotdan tushib qolardi.
  const out = summarizeSources([], [{ id: 'x', source: 'chatla_dm', order_type: 'purchase', status: 'completed', base_price: 70000 }]);
  const row = out.rows.find((r) => r.slug === 'chatla_dm');
  assert.ok(row, 'qator bor');
  assert.equal(row.users, 0);
  assert.equal(row.revenue, 70000);
  assert.equal(row.conversion, null);
});

test('summarizeSources: bo\'sh kirish — bo\'sh natija, xato emas', () => {
  const out = summarizeSources([], []);
  assert.deepEqual(out.rows, []);
  assert.deepEqual(out.reels, []);
  assert.equal(out.totals.revenue, 0);
});
