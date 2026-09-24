const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseHumoAmount,
  isHumoNotification,
  isHumoSender,
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

test('detects a real HUMO top-up only from the HUMO bot sender', () => {
  const topupText = '🎉 Пополнение\n➕ 245.731,00 UZS';
  // Haqiqiy HUMO botidan (username band — soxtalab bo'lmaydi) — qabul qilinadi.
  assert.equal(isHumoNotification({ from: { username: 'HUMOcardbot' }, text: topupText }), true);
  // Admin HUMO bot xabarini forward qilsa ham — manba HUMO bot.
  assert.equal(isHumoNotification({ forward_from: { username: 'humocardbot' }, text: topupText }), true);
  assert.equal(
    isHumoNotification({ forward_origin: { sender_user: { username: 'humocardbot' } }, text: topupText }),
    true,
  );
});

// Soxta to'lov teshigi (KRITIK): ilgari faqat matn "Пополнение ➕ X UZS" bo'lsa
// yetardi va istalgan odam botga shu matnni yozib to'lovsiz tovar olardi.
test('rejects a fake top-up that only has the text but not the HUMO sender', () => {
  const topupText = '🎉 Пополнение\n➕ 245.731,00 UZS';
  assert.equal(isHumoNotification({ text: topupText }), false);
  assert.equal(isHumoNotification({ from: { username: 'random_user' }, text: topupText }), false);
  assert.equal(isHumoNotification({ from: { id: 777000111 }, text: topupText }), false);
  // O'zi yozgan xabarni forward qilsa ham — manba HUMO bot emas.
  assert.equal(
    isHumoNotification({ forward_origin: { sender_user: { username: 'attacker' } }, text: topupText }),
    false,
  );
});

test('isHumoSender checks the sender, independent of the text', () => {
  assert.equal(isHumoSender({ from: { username: 'HUMOcardbot' } }), true);
  assert.equal(isHumoSender({ from: { username: 'someone' } }), false);
  assert.equal(isHumoSender({ text: 'Пополнение ➕ 1 UZS' }), false);
});

test('HUMO_CARD_BOT_ID env lets a numeric sender id be trusted', () => {
  const topupText = '🎉 Пополнение\n➕ 100.000,00 UZS';
  const prev = process.env.HUMO_CARD_BOT_ID;
  process.env.HUMO_CARD_BOT_ID = '555000123';
  try {
    assert.equal(isHumoNotification({ from: { id: 555000123 }, text: topupText }), true);
    assert.equal(isHumoNotification({ from: { id: 999 }, text: topupText }), false);
  } finally {
    if (prev === undefined) delete process.env.HUMO_CARD_BOT_ID;
    else process.env.HUMO_CARD_BOT_ID = prev;
  }
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
