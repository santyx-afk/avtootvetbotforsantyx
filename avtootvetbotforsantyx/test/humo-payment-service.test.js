const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHumoAmount, isHumoNotification } = require('../shared/humo-payment-service');

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
