const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Yetkazishda login/parol/kalit HTML-escape qilinishi kerak. Aks holda parolda
// `<`, `>` yoki `&` bo'lsa (generatsiya qilingan parollarda odatiy) Telegram
// parse_mode:'HTML' xabarni rad etadi, akkaunt "available" ga qaytadi va o'sha
// buzuq yozuv keyingi mijozlarga qayta-qayta tushib, yetkazishni to'xtatadi.
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '1:mock';
process.env.INVENTORY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { encryptText } = require('../shared/encryption');
const { processApprovedDelivery } = require('../shared/delivery-service');

test('auto_account delivery HTML-escapes the login and password', async () => {
  const PASSWORD = 'p<a>ss&"word';
  const LOGIN = 'user&<x>@mail.com';
  const item = { id: 'inv1', plan_id: 'p1', type: 'auto_account', status: 'available', login: LOGIN, password_encrypted: encryptText(PASSWORD) };
  const plan = { id: 'p1', name: 'CapCut Pro', delivery_type: 'auto_account', currency: 'UZS' };
  const order = { id: 'o1', order_number: '999', user_telegram_id: '222', plan_id: 'p1', status: 'payment_detected', delivery_status: 'waiting_approval', inventory_item_id: null };

  let userText = null;
  let markedSold = false;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const reply = (data) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data });

    if (u.includes('api.telegram.org')) {
      if (String(body?.chat_id) === '222') userText = String(body.text || '');
      return reply({ ok: true, result: { message_id: 1 } });
    }
    if (u.includes('/rest/v1/plans')) return reply([plan]);
    if (u.includes('/rest/v1/rpc/claim_inventory_item')) return reply([item]);
    if (u.includes('/rest/v1/inventory_items') && method === 'PATCH') {
      if (body?.status === 'sold') markedSold = true;
      return reply([{ ...item, status: body?.status }]);
    }
    // audit_logs, delivery_logs, orders(PATCH), subscriptions, referrals, cashback…
    return reply([]);
  };

  const result = await processApprovedDelivery({ supabase: { url: process.env.SUPABASE_URL, key: 'mock' }, order, adminTelegramId: 'test' });

  assert.equal(result.ok, true, 'yetkazish muvaffaqiyatli bo‘lishi kerak');
  assert.equal(markedSold, true, 'akkaunt sold deb belgilanishi kerak (available ga qaytmasin)');
  assert.ok(userText, 'mijozga xabar ketishi kerak');
  // Xom, escape qilinmagan belgilar QOLMASLIGI kerak.
  assert.ok(!userText.includes('p<a>ss'), 'xom parol HTML sifatida ketmasligi kerak');
  assert.ok(!userText.includes('&<x>@'), 'xom login HTML sifatida ketmasligi kerak');
  // Escape qilingan ko'rinishlar bo'lishi kerak.
  assert.ok(userText.includes('p&lt;a&gt;ss&amp;'), 'parol escape qilingan bo‘lishi kerak');
  assert.ok(userText.includes('user&amp;&lt;x&gt;@mail.com'), 'login escape qilingan bo‘lishi kerak');
  assert.ok(userText.includes('<code>'), '<code> ichida yuborilishi kerak');
});
