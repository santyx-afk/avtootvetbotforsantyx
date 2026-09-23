const test = require('node:test');
const assert = require('node:assert/strict');

// handleReceipt endi buyurtma holatini tekshiradi: yakunlangan/to'langan buyurtma
// uchun mijozning xabari CHEK deb qabul qilinmaydi (aks holda ikkinchi akkaunt
// bekorga ketardi). Faqat haqiqatan to'lov kutayotgan buyurtma uchun chek oqimi.
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '1:mock';
process.env.ADMIN_TELEGRAM_IDS = '111';

const { handleReceipt } = require('../shared/bot-service');

function installMock(order) {
  const calls = { orderPatch: [], tgToAdmin: [], tgToUser: [], stateWrites: [] };
  const USER = 222;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const reply = (data) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data });

    if (u.includes('api.telegram.org')) {
      const chat = String(body?.chat_id ?? '');
      if (chat === '111') calls.tgToAdmin.push(body);
      else if (chat === String(USER)) calls.tgToUser.push(body);
      return reply({ ok: true, result: { message_id: 1 } });
    }
    if (u.includes('/rest/v1/user_states')) {
      if (method === 'GET') return reply([{ state: { awaiting_receipt: true, current_order_id: order.id } }]);
      calls.stateWrites.push(body);
      return reply([{}]);
    }
    if (u.includes('/rest/v1/orders')) {
      if (method === 'PATCH') {
        calls.orderPatch.push({ query: u.split('?')[1], body });
        // Faqat to'lov kutayotgan holatdan o'tadi (haqiqiy shartni taqlid qilamiz).
        if (['waiting_payment', 'pending_payment'].includes(order.status)) {
          Object.assign(order, body);
          return reply([order]);
        }
        return reply([]);
      }
      return reply([order]); // GET getOrderById
    }
    if (u.includes('/rest/v1/receipt_submissions')) return reply([{ id: 'r1' }]);
    if (u.includes('/rest/v1/settings')) return reply([{ id: 1 }]);
    return reply([]);
  };
  return { calls, USER };
}

const msg = (USER) => ({ message_id: 9, from: { id: USER, first_name: 'Mijoz' }, chat: { id: USER, type: 'private' }, text: 'rahmat, oldim' });

test('completed order: a later message is NOT treated as a receipt', async () => {
  const order = { id: 'o1', order_number: '12345', status: 'completed', delivery_status: 'delivered', unique_price: 45123, expires_at: null };
  const { calls, USER } = installMock(order);
  await handleReceipt({ supabase: { url: process.env.SUPABASE_URL, key: 'mock' }, message: msg(USER) });

  const flipped = calls.orderPatch.some((p) => p.body?.status === 'payment_uploaded');
  assert.equal(flipped, false, 'yakunlangan buyurtma payment_uploaded ga qaytmasligi kerak');
  assert.equal(calls.tgToAdmin.length, 0, 'adminга soxta chek/tugma ketmasligi kerak');
  assert.equal(order.status, 'completed', 'buyurtma holati o‘zgarmasligi kerak');
  assert.match(String(calls.tgToUser[0]?.text || ''), /allaqachon qabul/);
});

test('open (waiting_payment) order: a real receipt still reaches admin with buttons', async () => {
  const order = { id: 'o2', order_number: '22222', status: 'waiting_payment', delivery_status: 'checking', unique_price: 45123, expires_at: new Date(Date.now() + 600000).toISOString() };
  const { calls, USER } = installMock(order);
  await handleReceipt({ supabase: { url: process.env.SUPABASE_URL, key: 'mock' }, message: msg(USER) });

  const flipped = calls.orderPatch.some((p) => p.body?.status === 'payment_uploaded');
  assert.equal(flipped, true, 'to‘lov kutayotgan buyurtma chek qabul qilinganda payment_uploaded bo‘ladi');
  const hasButtons = calls.tgToAdmin.some((m) => m.reply_markup && JSON.stringify(m.reply_markup).includes('admin:approve:'));
  assert.equal(hasButtons, true, 'adminга ✅/❌ tugmalar borishi kerak');
});

test('expired (but still waiting) order: not treated as a receipt', async () => {
  const order = { id: 'o3', order_number: '33333', status: 'waiting_payment', delivery_status: 'checking', unique_price: 45123, expires_at: new Date(Date.now() - 1000).toISOString() };
  const { calls, USER } = installMock(order);
  await handleReceipt({ supabase: { url: process.env.SUPABASE_URL, key: 'mock' }, message: msg(USER) });

  const flipped = calls.orderPatch.some((p) => p.body?.status === 'payment_uploaded');
  assert.equal(flipped, false, 'muddati o‘tgan buyurtma chek qabul qilmasligi kerak');
  assert.equal(calls.tgToAdmin.length, 0);
});
