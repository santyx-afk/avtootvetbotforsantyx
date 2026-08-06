const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateOrderMoney,
  workerShareOnTimeout,
  COMMISSION_RATE,
} = require('../shared/vacancy-order-service');

test('splits order amount into commission, worker share and two payments', () => {
  const money = calculateOrderMoney(100000);
  assert.equal(money.amount, 100000);
  assert.equal(money.commission, 10000); // 10%
  assert.equal(money.worker_amount, 90000);
  assert.equal(money.first_payment, 50000);
  assert.equal(money.second_payment, 50000);
});

test('payment halves always add back up to the full amount (no rounding loss)', () => {
  for (const amount of [1, 3, 999, 50001, 123457, 7777777]) {
    const money = calculateOrderMoney(amount);
    assert.equal(
      money.first_payment + money.second_payment,
      money.amount,
      `halves must sum to amount for ${amount}`,
    );
    assert.equal(
      money.commission + money.worker_amount,
      money.amount,
      `commission + worker share must sum to amount for ${amount}`,
    );
  }
});

test('commission rate is 10 percent', () => {
  assert.equal(COMMISSION_RATE, 0.1);
  assert.equal(calculateOrderMoney(250000).commission, 25000);
});

test('ignores invalid amounts instead of producing NaN', () => {
  for (const bad of [null, undefined, 'abc', NaN]) {
    const money = calculateOrderMoney(bad);
    assert.equal(money.amount, 0);
    assert.equal(money.commission, 0);
    assert.equal(money.worker_amount, 0);
  }
});

test('final-payment timeout pays worker 40% of total (50% held minus 10% commission)', () => {
  const money = calculateOrderMoney(200000);
  const order = { first_payment: money.first_payment, commission: money.commission };
  // 100 000 ushlab qolindi, 20 000 komissiya → 80 000 montajorga (jami summaning 40%)
  assert.equal(workerShareOnTimeout(order), 80000);
  assert.equal(workerShareOnTimeout(order), money.amount * 0.4);
});
