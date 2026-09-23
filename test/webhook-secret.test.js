const test = require('node:test');
const assert = require('node:assert/strict');

// Webhook maxfiy tokeni majburiy: token yo'q bo'lsa yoki mos kelmasa update
// rad etiladi. Bu soxta update (masalan admin callback) yuborishning oldini oladi.
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '1:mock';

const { handler } = require('../netlify/functions/telegram-webhook');

// Sekret gate o'tgach idempotentlik tekshiruvi processed_updates ga INSERT qiladi:
// yangi update uchun qator qaytishi kerak (aks holda "takror" deb hisoblanadi).
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : undefined;
  const data = u.includes('/rest/v1/processed_updates') && (opts.method === 'POST')
    ? [{ update_id: body?.update_id ?? 1 }]
    : [];
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data };
};

const fakeAdminCallback = JSON.stringify({
  update_id: 1,
  callback_query: { id: 'c1', from: { id: 111, first_name: 'X' }, message: { chat: { id: 111 }, message_id: 5 }, data: 'admin:approve:some-order' },
});

test('rejects updates when TELEGRAM_WEBHOOK_SECRET is not configured', async () => {
  const prev = process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  try {
    const res = await handler({ headers: {}, body: fakeAdminCallback });
    assert.match(res.body, /webhook-secret-not-configured/);
  } finally {
    if (prev !== undefined) process.env.TELEGRAM_WEBHOOK_SECRET = prev;
  }
});

test('rejects updates with a wrong secret token', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret-value';
  const res = await handler({ headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, body: fakeAdminCallback });
  assert.match(res.body, /invalid-secret/);
});

test('accepts an update with the correct secret token', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret-value';
  // Bo'sh update — hech qanday tarmoq (handler) chaqirilmaydi, faqat gate o'tadi.
  const res = await handler({ headers: { 'x-telegram-bot-api-secret-token': 's3cret-value' }, body: JSON.stringify({ update_id: 2 }) });
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ignored, undefined);
});
