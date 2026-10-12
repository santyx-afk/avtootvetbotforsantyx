const test = require('node:test');
const assert = require('node:assert/strict');

// Ommaviy xabarni keyinroq yuborish: panel 'scheduled' ish yaratadi, cron
// vaqti kelganda ro'yxatni yangilab navbatga qo'yadi; bekor qilingani chiqmaydi.
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = 'mock-token';
process.env.APP_BASE_URL = 'https://app.test';

const { createSession } = require('../shared/auth');
const bc = require('../shared/broadcast-service');
const { handler } = require('../netlify/functions/admin-messages');

const owner = { cookie: `admin_session=${createSession({ role: 'owner' })}` };
const client = { url: process.env.SUPABASE_URL, key: 'mock' };

// PostgREST'ning kerakli qismi: broadcast_jobs (GET/POST/PATCH, eq/in/lte shartlari),
// users (segment), settings; Telegram va background chaqiruvlari sanaladi.
function fakeDb({ users = [], schemaHasSchedule = true } = {}) {
  const db = { jobs: [], telegram: [], background: 0 };
  const match = (row, params) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      const [op, ...rest] = v.split('.');
      const val = rest.join('.');
      if (op === 'eq' && String(row[k]) !== val) return false;
      if (op === 'in' && !val.replace(/[()]/g, '').split(',').includes(String(row[k]))) return false;
      if (op === 'lte' && !(row[k] && Date.parse(row[k]) <= Date.parse(val))) return false;
    }
    return true;
  };
  global.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body });
    if (u.hostname === 'api.telegram.org') { db.telegram.push(u.pathname.split('/').pop()); return reply(200, { ok: true, result: { message_id: 1 } }); }
    if (u.hostname === 'app.test') { db.background += 1; return reply(202, {}); }
    const table = u.pathname.split('/').pop();
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    if (table === 'users') return reply(200, Number(u.searchParams.get('offset') || 0) ? [] : users);
    if (table === 'settings') return reply(200, [{ id: 1, admin_telegram_id: '999' }]);
    if (table !== 'broadcast_jobs') return reply(200, []);
    if (method === 'POST') {
      if (!schemaHasSchedule && ('scheduled_at' in body || body.status === 'scheduled')) {
        return reply(400, { code: 'PGRST204', message: "Could not find the 'scheduled_at' column of 'broadcast_jobs' in the schema cache" });
      }
      const row = { id: `job${db.jobs.length + 1}`, cursor: 0, sent: 0, failed: 0, scheduled_at: null, ...body };
      db.jobs.push(row);
      return reply(201, [row]);
    }
    const rows = db.jobs.filter((r) => match(r, u.searchParams));
    if (method === 'PATCH') { rows.forEach((r) => Object.assign(r, body)); return reply(200, rows); }
    return reply(200, rows);
  };
  return db;
}

const inHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const post = (body) => handler({ httpMethod: 'POST', headers: owner, body: JSON.stringify(body) });

test('panel: matnli xabar rejalashtiriladi — darhol yuborilmaydi', async () => {
  const db = fakeDb({ users: [{ telegram_id: '1' }, { telegram_id: '2' }] });
  const res = await post({ type: 'broadcast', text: 'Salom', segment: 'all', scheduled_at: inHours(20) });
  assert.equal(res.statusCode, 200);
  assert.match(JSON.parse(res.body).message, /Rejalashtirildi/);
  assert.equal(db.jobs.length, 1);
  assert.equal(db.jobs[0].status, 'scheduled');
  assert.ok(db.jobs[0].scheduled_at);
  assert.equal(db.background, 0, 'background ishga tushmasligi kerak');
  assert.equal(db.telegram.length, 0, 'hech kimga xabar ketmasligi kerak');
});

test('panel: o\'tgan yoki juda uzoq vaqt rad etiladi', async () => {
  fakeDb();
  assert.equal((await post({ type: 'broadcast', text: 'x', scheduled_at: inHours(-1) })).statusCode, 400);
  assert.equal((await post({ type: 'broadcast', text: 'x', scheduled_at: inHours(24 * 61) })).statusCode, 400);
  assert.equal((await post({ type: 'broadcast', text: 'x', scheduled_at: 'ertaga' })).statusCode, 400);
});

test('panel: migratsiya yo\'q — tushunarli xato; oddiy broadcast ishlayveradi', async () => {
  const db = fakeDb({ users: [{ telegram_id: '1' }], schemaHasSchedule: false });
  const res = await post({ type: 'broadcast', text: 'x', scheduled_at: inHours(2) });
  assert.equal(res.statusCode, 500);
  assert.match(JSON.parse(res.body).error, /2026-10-12_broadcast-scheduled\.sql/);
  const now = await post({ type: 'broadcast', text: 'x' });
  assert.equal(now.statusCode, 200);
  assert.equal(db.jobs[0].status, 'queued');
});

test('cron: vaqti kelgan ish ro\'yxati yangilanib navbatga qo\'yiladi, kelmagani va bekor qilingani — yo\'q', async () => {
  const db = fakeDb({ users: [{ telegram_id: '1' }, { telegram_id: '2' }, { telegram_id: '3' }] });
  db.jobs.push(
    { id: 'due', kind: 'text', status: 'scheduled', segment: 'all', scheduled_at: inHours(-0.1), recipients: ['1'], total: 1, text: 'a' },
    { id: 'later', kind: 'text', status: 'scheduled', segment: 'all', scheduled_at: inHours(5), recipients: [], total: 0, text: 'b' },
    { id: 'gone', kind: 'text', status: 'cancelled', segment: 'all', scheduled_at: inHours(-1), recipients: [], total: 0, text: 'c' },
  );
  const out = await bc.releaseScheduledBroadcasts(client);
  assert.deepEqual(out, [{ id: 'due', status: 'queued' }]);
  const due = db.jobs.find((j) => j.id === 'due');
  assert.equal(due.status, 'queued');
  assert.deepEqual(due.recipients, ['1', '2', '3'], 'yuborish paytidagi ro\'yxat');
  assert.equal(due.total, 3);
  assert.equal(db.background, 1);
  assert.equal(db.jobs.find((j) => j.id === 'later').status, 'scheduled');
  assert.equal(db.jobs.find((j) => j.id === 'gone').status, 'cancelled');
});

test('bot: rejalashtirilgan "Admin xabari" tasdiqlangach vaqtini kutadi', async () => {
  const db = fakeDb();
  db.jobs.push({ id: 'copy1', kind: 'copy', status: 'awaiting_confirm', segment: 'all', scheduled_at: inHours(3), from_chat_id: '999', message_id: 5, recipients: ['1'], total: 1 });
  const job = await bc.queueJob(client, 'copy1');
  assert.equal(job.status, 'scheduled');
  assert.equal(db.background, 0);

  // Rejasiz — avvalgidek darhol navbatga
  db.jobs.push({ id: 'copy2', kind: 'copy', status: 'awaiting_confirm', segment: 'all', scheduled_at: null, from_chat_id: '999', message_id: 6, recipients: ['1'], total: 1 });
  const now = await bc.queueJob(client, 'copy2');
  assert.equal(now.status, 'queued');
  assert.equal(db.background, 1);
});

test('formatTashkent: UTC → Toshkent', () => {
  assert.equal(bc.formatTashkent('2026-10-13T05:00:00Z'), '13.10 10:00');
});
