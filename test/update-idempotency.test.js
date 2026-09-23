const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '1:mock';
process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret-value';

const db = require('../shared/db');
const client = { url: process.env.SUPABASE_URL, key: 'mock' };

// processed_updates ni xotirada (PRIMARY KEY update_id) taqlid qiladi.
function installUpdatesStore() {
  const seen = new Set();
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const reply = (data) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data });
    if (u.includes('/rest/v1/processed_updates') && (opts.method || 'GET') === 'POST') {
      const id = body.update_id;
      if (seen.has(id)) return reply([]); // ignore-duplicates: takror → bo'sh
      seen.add(id);
      return reply([{ update_id: id }]);
    }
    // Qolgan hamma so'rov (webhook handlerlari) — no-op.
    return reply([]);
  };
  return seen;
}

test('markUpdateProcessed: first time true, duplicate false', async () => {
  installUpdatesStore();
  assert.equal(await db.markUpdateProcessed(client, 100), true);
  assert.equal(await db.markUpdateProcessed(client, 100), false);
  assert.equal(await db.markUpdateProcessed(client, 101), true);
});

test('markUpdateProcessed: no update_id is not deduped (true)', async () => {
  installUpdatesStore();
  assert.equal(await db.markUpdateProcessed(client, undefined), true);
  assert.equal(await db.markUpdateProcessed(client, null), true);
});

test('markUpdateProcessed: fails open when the table is missing', async () => {
  global.fetch = async () => ({ ok: false, status: 404, headers: { get: () => null }, text: async () => 'relation "processed_updates" does not exist' });
  assert.equal(await db.markUpdateProcessed(client, 200), true, 'jadval yo\'q bo\'lsa bot to\'xtamaydi');
});

test('webhook ignores a duplicate update_id', async () => {
  installUpdatesStore();
  const { handler } = require('../netlify/functions/telegram-webhook');
  const req = () => ({
    headers: { 'x-telegram-bot-api-secret-token': 's3cret-value' },
    body: JSON.stringify({ update_id: 777, message: { message_id: 1, from: { id: 5, first_name: 'A' }, chat: { id: 5, type: 'private' }, text: '/help' } }),
  });
  const first = await handler(req());
  assert.equal(JSON.parse(first.body).ignored, undefined, 'birinchi marta ishlanadi');
  const second = await handler(req());
  assert.match(second.body, /duplicate-update/, 'takror update o\'tkazib yuboriladi');
});
