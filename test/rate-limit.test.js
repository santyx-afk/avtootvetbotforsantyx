const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Hisoblashning o'zi endi bazadagi atomik rate_limit_hit funksiyasida
// (migrations/2026-08-24_rate-limit-atomic.sql) — parallel so'rovlar
// hisoblagichni chetlab o'tmasligi uchun. Bu testlar JS taraf zimmasidagi
// ishni tekshiradi: RPC ga to'g'ri parametr borishi, javob talqini va baza
// yiqilganda scope'ga qarab ochiq (lead) yoki yopiq (login kodi) qolish.

function loadRateLimit({ rpc, failWrite = false } = {}) {
  const calls = [];
  const writes = [];
  const fakeDb = {
    async rpcRequest(_client, fnName, body) {
      calls.push({ fnName, body });
      if (rpc instanceof Error) throw rpc;
      return rpc;
    },
    async request(_client, table, opts) {
      if (failWrite) throw new Error('baza yozmadi');
      writes.push({ table, opts });
      return { data: null };
    },
  };
  const originalLoad = Module._load;
  Module._load = function (request) {
    if (request === './db') return fakeDb;
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../shared/rate-limit')];
  const mod = require('../shared/rate-limit');
  Module._load = originalLoad;
  return { mod, calls, writes };
}

const OPTS = { scope: 'web_code', key: '1.2.3.4', limit: 5, windowSeconds: 600, blockSeconds: 1800 };

test('ruxsat: RPC ga to\'g\'ri parametrlar boradi', async () => {
  const { mod, calls } = loadRateLimit({ rpc: { allowed: true } });
  const res = await mod.hit(null, OPTS);
  assert.deepStrictEqual(res, { allowed: true });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].fnName, 'rate_limit_hit');
  assert.deepStrictEqual(calls[0].body, {
    p_scope: 'web_code',
    p_key: '1.2.3.4',
    p_limit: 5,
    p_window_seconds: 600,
    p_block_seconds: 1800,
  });
});

test('blok javobi retryAfter bilan qaytadi', async () => {
  const { mod } = loadRateLimit({ rpc: { allowed: false, retry_after: 1234 } });
  const res = await mod.hit(null, OPTS);
  assert.deepStrictEqual(res, { allowed: false, retryAfter: 1234 });
});

test('retry_after kelmasa blockSeconds ishlatiladi', async () => {
  const { mod } = loadRateLimit({ rpc: { allowed: false } });
  const res = await mod.hit(null, OPTS);
  assert.deepStrictEqual(res, { allowed: false, retryAfter: 1800 });
});

test('baza yiqilsa odatiy scope o\'tkazadi (fail-open, masalan lead formasi)', async () => {
  const { mod } = loadRateLimit({ rpc: new Error('baza yetib bormadi') });
  const res = await mod.hit(null, OPTS);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.degraded, true);
});

test('failClosed bilan baza yiqilsa so\'rov RAD etiladi (login kodi)', async () => {
  const { mod } = loadRateLimit({ rpc: new Error('baza yetib bormadi') });
  const res = await mod.hit(null, { ...OPTS, failClosed: true });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.degraded, true);
  assert.ok(res.retryAfter > 0);
});

test('tushunarsiz RPC javobi ham failClosed da rad etiladi', async () => {
  const { mod } = loadRateLimit({ rpc: null });
  const res = await mod.hit(null, { ...OPTS, failClosed: true });
  assert.strictEqual(res.allowed, false);
});

test('reset() hisoblagichni nolga tushiradi', async () => {
  const { mod, writes } = loadRateLimit({ rpc: { allowed: true } });
  await mod.reset(null, 'web_code', '1.2.3.4');
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].table, 'rate_limits');
  const body = writes[0].opts.body;
  assert.strictEqual(body.scope, 'web_code');
  assert.strictEqual(body.key, '1.2.3.4');
  assert.strictEqual(body.attempts, 0);
  assert.strictEqual(body.blocked_until, null);
});

test('reset() xatosi yutiladi — kirishni to\'xtatmaydi', async () => {
  const { mod } = loadRateLimit({ rpc: { allowed: true }, failWrite: true });
  await assert.doesNotReject(() => mod.reset(null, 'web_code', '1.2.3.4'));
});

test('clientIp: Netlify va proksi headerlaridan IP ni oladi', () => {
  const { mod } = loadRateLimit({ rpc: { allowed: true } });
  assert.strictEqual(mod.clientIp({ 'x-nf-client-connection-ip': '5.5.5.5' }), '5.5.5.5');
  assert.strictEqual(mod.clientIp({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7' }), '6.6.6.6');
  assert.strictEqual(mod.clientIp({}), 'unknown');
});
