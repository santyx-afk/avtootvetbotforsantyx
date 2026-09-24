const test = require('node:test');
const assert = require('node:assert/strict');

// Bir vaqtda ikki checkout bir xil unique_price olib qolsa, partial unique index
// INSERT ni rad etadi — createCheckoutOrder suffiksni qayta generatsiya qilib
// qayta uradi (to'lov noto'g'ri buyurtmaga tushmasin).
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const db = require('../shared/db');
const client = { url: process.env.SUPABASE_URL, key: 'mock' };

function reply(data, okFlag = true, status = 200) {
  return { ok: okFlag, status, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data };
}
function dupUniquePrice() {
  return reply({ code: '23505', message: 'duplicate key value violates unique constraint "orders_unique_price_waiting_idx"' }, false, 409);
}

test('createCheckoutOrder regenerates unique_price on collision', async () => {
  let orderPosts = 0;
  const prices = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    if (u.includes('/rest/v1/orders') && method === 'GET') {
      // generateUniquePrice: band qilingan suffikslar ro'yxati (bo'sh)
      return reply([]);
    }
    if (u.includes('/rest/v1/orders') && method === 'POST') {
      const body = JSON.parse(opts.body);
      prices.push(body.unique_price);
      orderPosts += 1;
      if (orderPosts === 1) return dupUniquePrice(); // birinchi urinish to'qnashadi
      return reply([{ id: 'o1', order_number: body.order_number, unique_price: body.unique_price, base_price: body.base_price, balance_used: 0 }]);
    }
    if (u.includes('/rest/v1/order_items')) return reply([{}]);
    return reply([]);
  };

  const order = await db.createCheckoutOrder(client, {
    user_telegram_id: '222',
    items: [{ plan_id: 'p1', plan: { id: 'p1', price: 45000 }, quantity: 1 }],
  });

  assert.ok(order, 'buyurtma yaratilishi kerak');
  assert.equal(orderPosts, 2, 'to\'qnashuvdan keyin qayta urinadi');
  assert.equal(prices.length, 2);
  assert.notEqual(prices[0], prices[1], 'ikkinchi urinishda boshqa unique_price');
  assert.ok(prices[1] > 45000 && prices[1] < 46000, 'suffiks 45000 ustiga qo\'shiladi');
});
