const test = require('node:test');
const assert = require('node:assert/strict');
const { _summarizeOrders: summarize, _rangeBounds: rangeBounds } = require('../netlify/functions/admin-dashboard.js');

const range = { from: '2026-09-01', to: '2026-09-03' };
const orders = [
  // to'langan xarid: 100 000 − 10 000 chegirma, 30 000 balansdan, kartaga 60 123
  { user_telegram_id: '1', order_type: 'purchase', status: 'completed', delivery_status: 'delivered', base_price: 100000, discount_amount: 10000, balance_used: 30000, unique_price: 60123, created_at: '2026-09-01T05:00:00Z', plan_id: 'p1' },
  // to'langan xarid, xuddi shu mijoz (takroriy)
  { user_telegram_id: '1', order_type: 'purchase', status: 'payment_detected', delivery_status: 'waiting_approval', base_price: 50000, discount_amount: 0, balance_used: 0, unique_price: 50321, created_at: '2026-09-02T05:00:00Z', plan_id: 'p1' },
  // muddati o'tgan
  { user_telegram_id: '2', order_type: 'purchase', status: 'expired', base_price: 70000, unique_price: 70111, created_at: '2026-09-02T05:00:00Z', plan_id: 'p2' },
  // balans to'ldirish (sotuvga kirmaydi, kartaga kiradi)
  { user_telegram_id: '3', order_type: 'topup', status: 'completed', base_price: 20000, unique_price: 20555, created_at: '2026-09-03T05:00:00Z' },
  // oraliqdan tashqarida (Toshkent 04.09 00:30 = UTC 03.09 19:30) — kunlik seriyaga kirmaydi
  { user_telegram_id: '4', order_type: 'purchase', status: 'completed', base_price: 1000, unique_price: 1000, created_at: '2026-09-03T19:30:00Z', plan_id: 'p1' },
];

test('summarizeOrders: sotuv, kartaga tushgan, balansdan, o\'rtacha chek', () => {
  const s = summarize(orders, range);
  // 90 000 + 50 000 + 1 000 (oxirgisi ro'yxatda, seriyaga kirmasa ham hisobga kiradi)
  assert.equal(s.sales, 141000);
  assert.equal(s.cardIncome, 60123 + 50321 + 20555 + 1000);
  assert.equal(s.balancePaid, 30000);
  assert.equal(s.topupIncome, 20555);
  assert.equal(s.avgCheck, Math.round(141000 / 3));
});

test('summarizeOrders: voronka va xaridorlar', () => {
  const s = summarize(orders, range);
  assert.equal(s.ordersCreated, 4);
  assert.equal(s.ordersPaid, 3);
  assert.equal(s.ordersDelivered, 2);
  assert.equal(s.ordersExpired, 1);
  assert.equal(s.uniqueBuyers, 2);
  assert.equal(s.repeatBuyers, 1);
  assert.equal(s.conversion, 75);
  assert.deepEqual(s.topSoldIds[0], { id: 'p1', total: 3 });
});

test('summarizeOrders: kunlik seriya Toshkent kuni bo\'yicha', () => {
  const s = summarize(orders, range);
  assert.equal(s.dailyRevenue.length, 3);
  assert.deepEqual(s.dailyRevenue.map((d) => d.iso), ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(s.dailyRevenue[0].revenue, 90000);
  assert.equal(s.dailyRevenue[1].revenue, 50000);
  assert.equal(s.dailyRevenue[1].created, 2);
  assert.equal(s.dailyRevenue[2].revenue, 0); // 04.09 Toshkent — oraliqdan tashqarida
});

test('rangeBounds: sukut 30 kun, teskari sanalar almashadi, 366 kundan oshmaydi', () => {
  const r = rangeBounds({});
  assert.equal((Date.parse(r.to) - Date.parse(r.from)) / 86400000, 29);
  const swapped = rangeBounds({ from: '2026-09-05', to: '2026-09-01' });
  assert.equal(swapped.from, '2026-09-01');
  assert.equal(swapped.to, '2026-09-05');
  assert.equal(swapped.fromIso, '2026-09-01T00:00:00+05:00');
  const long = rangeBounds({ from: '2020-01-01', to: '2026-09-05' });
  assert.ok((Date.parse(long.to) - Date.parse(long.from)) / 86400000 <= 366);
});
