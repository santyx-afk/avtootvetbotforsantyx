const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// INTEGRATSION test: webhook → to'lov aniqlash → yetkazish. Bir joyda:
//  - HAQIQIY HUMO to'lovi (business_message, @humocardbot) obunani yetkazadi;
//  - SOXTA to'lov (oddiy foydalanuvchi o'sha matnni yozsa) hech narsa yetkazmaydi.
// Bu 1-bosqichdagi eng muhim teshikni uchidan-uchiga qoplaydi (regressiya guard).
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '1:mock';
process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret';
process.env.ADMIN_TELEGRAM_IDS = '111';
process.env.INVENTORY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
// settlePaidOrder yetkazishни shu vaqtgacha kutadi; testда qisqa qilamiz (aks
// holda kutish taymeri tugaguncha test 6s osilib turadi).
process.env.DELIVERY_WAIT_MS = '150';

const { encryptText } = require('../shared/encryption');
const { handler } = require('../netlify/functions/telegram-webhook');

const AMOUNT = 45123;
const BUYER = '222';

// Kichik in-memory mock: kerakli endpointlarga javob beradi, qolganига [].
function installFlowMock({ humoMatches }) {
  const calls = { confirmRpc: 0, toUser: [], inventorySold: false, orderCompleted: false };
  const order = { id: 'o1', order_number: '45001', user_telegram_id: BUYER, plan_id: 'p1', order_type: 'purchase', status: 'waiting_payment', delivery_status: 'waiting_approval', unique_price: AMOUNT, base_price: AMOUNT, balance_used: 0 };
  const plan = { id: 'p1', name: 'CapCut Pro', delivery_type: 'auto_account', currency: 'UZS' };
  const item = { id: 'inv1', plan_id: 'p1', type: 'auto_account', status: 'available', login: 'acc@mail.com', password_encrypted: encryptText('Secret<1>&') };

  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const reply = (data) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data });

    if (u.includes('api.telegram.org')) {
      const m = u.split('/').pop();
      if (m === 'sendMessage' && String(body?.chat_id) === BUYER) calls.toUser.push(String(body.text || ''));
      return reply({ ok: true, result: { message_id: 1 } });
    }
    if (u.includes('/rest/v1/processed_updates')) return reply([{ update_id: body?.update_id ?? 1 }]);
    if (u.includes('/rest/v1/rpc/confirm_payment_notification')) {
      calls.confirmRpc += 1;
      if (!humoMatches) return reply([{ status: 'no_match', order_id: null, order_row: null }]);
      return reply([{ status: 'matched', order_id: order.id, order_number: order.order_number, order_row: { ...order, status: 'payment_detected' } }]);
    }
    if (u.includes('/rest/v1/rpc/claim_inventory_item')) return reply([item]);
    if (u.includes('/rest/v1/plans')) return reply([plan]);
    if (u.includes('/rest/v1/order_items')) return reply([]); // bitta reja — element yo'q, to'g'ridan-to'g'ri yetkazish
    if (u.includes('/rest/v1/inventory_items') && method === 'PATCH') { if (body?.status === 'sold') calls.inventorySold = true; return reply([{ ...item, status: body?.status }]); }
    if (u.includes('/rest/v1/inventory_items')) return reply([{ status: 'available' }]);
    if (u.includes('/rest/v1/orders') && method === 'PATCH') { if (body?.status === 'completed') calls.orderCompleted = true; return reply([{ ...order, ...body }]); }
    if (u.includes('/rest/v1/orders')) return reply([order]);
    if (u.includes('/rest/v1/user_states')) return reply([{ state: {} }]); // awaiting_receipt yo'q
    if (u.includes('/rest/v1/users')) return reply([{ is_blocked: false, username: 'buyer', full_name: 'Buyer' }]);
    if (u.includes('/rest/v1/settings')) return reply([{ id: 1 }]);
    return reply([]);
  };
  return calls;
}

const humoText = '🎉 Пополнение\n➕ 45.123,00 UZS';

test('real HUMO business_message delivers the subscription (escaped credentials)', async () => {
  const calls = installFlowMock({ humoMatches: true });
  const update = {
    update_id: 5001,
    business_message: { message_id: 10, from: { id: 999, username: 'HUMOcardbot' }, chat: { id: 999, type: 'private' }, date: 1, text: humoText },
  };
  await handler({ headers: { 'x-telegram-bot-api-secret-token': 's3cret' }, body: JSON.stringify(update) });

  assert.equal(calls.confirmRpc, 1, 'to\'lov tasdiqlanishi kerak');
  assert.equal(calls.inventorySold, true, 'akkaunt sold bo\'lishi kerak');
  assert.equal(calls.orderCompleted, true, 'buyurtma completed bo\'lishi kerak');
  const creds = calls.toUser.join('\n');
  assert.match(creds, /acc@mail\.com/, 'login mijozga yuborilishi kerak');
  assert.match(creds, /Secret&lt;1&gt;&amp;/, 'parol HTML-escape qilingan bo\'lishi kerak');
});

test('fake payment (ordinary user typing the HUMO text) delivers nothing', async () => {
  const calls = installFlowMock({ humoMatches: true });
  const update = {
    update_id: 5002,
    message: { message_id: 11, from: { id: Number(BUYER), username: 'random', first_name: 'R' }, chat: { id: Number(BUYER), type: 'private' }, date: 1, text: humoText },
  };
  await handler({ headers: { 'x-telegram-bot-api-secret-token': 's3cret' }, body: JSON.stringify(update) });

  assert.equal(calls.confirmRpc, 0, 'soxta to\'lov confirm RPC ni chaqirmasligi kerak');
  assert.equal(calls.inventorySold, false, 'hech qanday akkaunt sotilmasligi kerak');
  const creds = calls.toUser.join('\n');
  assert.ok(!/acc@mail\.com/.test(creds), 'hech qanday kredensial ketmasligi kerak');
});
