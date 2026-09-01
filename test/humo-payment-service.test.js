const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseHumoAmount,
  isHumoNotification,
  deliveryOutcomeFromOrder,
} = require('../shared/humo-payment-service');

test('parses HUMO top-up amount with thousands dots and decimal comma', () => {
  const text = '🎉 Пополнение\n➕ 65.154,00 UZS\n⚠️ Комиссия: 0,00 UZS';
  assert.equal(parseHumoAmount(text), 65154);
});

test('ignores non-HUMO messages without UZS top-up marker', () => {
  assert.equal(parseHumoAmount('hello 65.154'), null);
  assert.equal(isHumoNotification({ from: { username: 'otherbot' }, text: 'hello' }), false);
});

test('detects HUMO notifications by sender username or top-up shape', () => {
  assert.equal(isHumoNotification({ from: { username: 'HUMOcardbot' }, text: 'anything' }), true);
  assert.equal(isHumoNotification({ text: '🎉 Пополнение\n➕ 245.731,00 UZS' }), true);
});

// Kutish muddati tugagani "yetkazilmadi" degani emas — buyurtma bazada
// yakunlangan bo'lsa admin muvaffaqiyat xabarini olishi kerak.
test('slow but finished delivery is reported as success', () => {
  const delivered = deliveryOutcomeFromOrder(
    { status: 'completed', delivery_status: 'delivered' },
    6,
  );
  assert.equal(delivered.ok, true);
  assert.equal(delivered.slow, true);

  const topup = deliveryOutcomeFromOrder({ status: 'completed', delivery_status: 'not_required' }, 6);
  assert.equal(topup.ok, true);
});

test('unfinished delivery is reported as needing attention', () => {
  const stuck = deliveryOutcomeFromOrder({ status: 'delivering', delivery_status: 'waiting_approval' }, 6);
  assert.equal(stuck.ok, false);
  assert.match(stuck.message, /6 soniyada tugamadi/);
  assert.match(stuck.message, /avtomatik qayta uradi/);

  const noStock = deliveryOutcomeFromOrder({ status: 'delivering', delivery_status: 'waiting_stock' }, 6);
  assert.equal(noStock.ok, false);
  assert.match(noStock.message, /Zaxira tugagan/);
});

test('unreadable order state is reported as needing attention', () => {
  const unknown = deliveryOutcomeFromOrder(null, 6);
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /holati o'qilmadi/);
});
