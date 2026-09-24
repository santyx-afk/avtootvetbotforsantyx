const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Egasi so'ragan: avto-akkaunt zaxirada qolmasa MIJOZGA "tugagan/zaxira yo'q"
// deyilmasin. To'lovdan keyin ham mijoz neytral "tayyorlanmoqda" xabarini oladi,
// admin esa aniq "zaxira tugadi" ogohlantirishini oladi (qo'lda ulash uchun).
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '1:mock';
process.env.INVENTORY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.ADMIN_TELEGRAM_IDS = '111';

const { processApprovedDelivery } = require('../shared/delivery-service');

test('out-of-stock auto delivery: customer gets a neutral message, admin gets the stock alert', async () => {
  const plan = { id: 'p1', name: 'CapCut Pro', delivery_type: 'auto_account' };
  const order = { id: 'o1', order_number: '999', user_telegram_id: '222', plan_id: 'p1', status: 'payment_detected', delivery_status: 'waiting_approval', base_price: 45000, inventory_item_id: null };

  const toUser = [];
  const toAdmin = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const reply = (data) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data });
    if (u.includes('api.telegram.org')) {
      const chat = String(body?.chat_id ?? '');
      if (chat === '222') toUser.push(String(body.text || ''));
      if (chat === '111') toAdmin.push(String(body.text || ''));
      return reply({ ok: true, result: { message_id: 1 } });
    }
    if (u.includes('/rest/v1/plans')) return reply([plan]);
    if (u.includes('/rest/v1/rpc/claim_inventory_item')) return reply([]); // zaxira YO'Q
    if (u.includes('/rest/v1/audit_logs')) return reply([]); // markOutOfStockNotifiedOnce: birinchi marta
    if (u.includes('/rest/v1/users')) return reply([{ username: 'mijoz', full_name: 'Mijoz' }]);
    if (u.includes('/rest/v1/settings')) return reply([{ id: 1 }]);
    return reply([]);
  };

  const res = await processApprovedDelivery({ supabase: { url: process.env.SUPABASE_URL, key: 'mock' }, order, adminTelegramId: 'test' });
  assert.equal(res.code, 'NO_STOCK');

  const userMsg = toUser.join('\n');
  assert.ok(userMsg, 'mijozga xabar ketishi kerak');
  assert.ok(!/zaxira/i.test(userMsg), 'mijozga "zaxira" so‘zi ketmasligi kerak');
  assert.ok(!/tuga/i.test(userMsg), 'mijozga "tugagan/tugadi" ketmasligi kerak');
  assert.ok(!/out of stock/i.test(userMsg));
  assert.match(userMsg, /qabul qilindi|tayyorlanmoqda/i);

  const adminMsg = toAdmin.join('\n');
  assert.match(adminMsg, /Zaxirada akkaunt qolmadi/i, 'admin aniq ogohlantirish olishi kerak');
});
