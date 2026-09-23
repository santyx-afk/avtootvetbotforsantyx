const test = require('node:test');
const assert = require('node:assert/strict');

// PostgREST max-rows (odatda 1000) tufayli bitta so'rov hamma foydalanuvchini
// qaytармасди — 1000+ bo'lsa broadcast hammaga bormasdi. fetchAllRows/resolveSegment
// endi offset bilan sahifalab HAMMASINI oladi.
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const bc = require('../shared/broadcast-service');
const client = { url: process.env.SUPABASE_URL, key: 'mock' };

// Server max-rows ni taqlid qiladi: limit qancha bo'lsa ham eng ko'pi shu.
function installPagingMock(rows, serverMaxRows = 1000) {
  global.fetch = async (url) => {
    const u = String(url);
    const params = new URLSearchParams(u.includes('?') ? u.split('?')[1] : '');
    const limit = Math.min(Number(params.get('limit') || serverMaxRows), serverMaxRows);
    const offset = Number(params.get('offset') || 0);
    const page = rows.slice(offset, offset + limit);
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(page), json: async () => page };
  };
}

test('fetchAllRows returns every row across pages (server caps at 1000)', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ telegram_id: String(i + 1) }));
  installPagingMock(rows, 1000);
  const all = await bc.fetchAllRows(client, 'users', 'select=telegram_id&order=telegram_id.asc');
  assert.equal(all.length, 2500, 'hamma qator kelishi kerak');
});

test('fetchAllRows works even when server max-rows is smaller than pageSize', async () => {
  const rows = Array.from({ length: 1300 }, (_, i) => ({ telegram_id: String(i + 1) }));
  installPagingMock(rows, 500); // server 500 bilan cheklaydi, pageSize 1000
  const all = await bc.fetchAllRows(client, 'users', 'select=telegram_id&order=telegram_id.asc');
  assert.equal(all.length, 1300, 'max-rows < pageSize bo\'lsa ham hammasi kelishi kerak');
});

test('resolveSegment(all) returns all 1000+ recipients', async () => {
  const rows = Array.from({ length: 2200 }, (_, i) => ({ telegram_id: String(i + 1), is_blocked: false }));
  installPagingMock(rows, 1000);
  const recipients = await bc.resolveSegment(client, 'all');
  assert.equal(recipients.length, 2200);
});
