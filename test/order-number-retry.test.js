const test = require('node:test');
const assert = require('node:assert/strict');

// order_number bazada UNIQUE. To'qnashuvda createOrder endi order_number ni
// qayta generatsiya qilib qayta urinadi (ilgari jimgina yiqilardi).
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const db = require('../shared/db');
const client = { url: process.env.SUPABASE_URL, key: 'mock' };

function dupError() {
  return { ok: false, status: 409, headers: { get: () => null }, text: async () => JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "orders_order_number_key"' }) };
}
function ok(row) {
  return { ok: true, status: 201, headers: { get: () => null }, text: async () => JSON.stringify([row]), json: async () => [row] };
}

test('createOrder retries with a new order_number on a unique collision', async () => {
  let attempts = 0;
  const seen = [];
  global.fetch = async (url, opts = {}) => {
    if (String(url).includes('/rest/v1/orders')) {
      const body = JSON.parse(opts.body);
      seen.push(body.order_number);
      attempts += 1;
      if (attempts < 3) return dupError(); // birinchi 2 urinish to'qnashadi
      return ok({ id: 'o1', order_number: body.order_number });
    }
    return ok({});
  };

  const order = await db.createOrder(client, { user_telegram_id: '1', amount: 1000 });
  assert.ok(order, 'buyurtma yaratilishi kerak');
  assert.equal(attempts, 3, '3-urinishda muvaffaqiyat');
  assert.equal(new Set(seen).size, 3, 'har urinishda boshqa order_number');
});

test('createOrder does NOT retry when the caller supplied the order_number', async () => {
  let attempts = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/rest/v1/orders')) {
      attempts += 1;
      return dupError();
    }
    return ok({});
  };
  await assert.rejects(() => db.createOrder(client, { user_telegram_id: '1', amount: 1000, order_number: '55555' }));
  assert.equal(attempts, 1, 'chaqiruvchi bergan raqamda qayta urinmaydi');
});

test('createOrder rethrows a non-collision error immediately', async () => {
  let attempts = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/rest/v1/orders')) {
      attempts += 1;
      return { ok: false, status: 500, headers: { get: () => null }, text: async () => 'internal error' };
    }
    return ok({});
  };
  await assert.rejects(() => db.createOrder(client, { user_telegram_id: '1', amount: 1000 }));
  assert.equal(attempts, 1, 'boshqa xatoda qayta urinmaydi');
});
