const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Chastota chegarasi login kodini taxmin qilishdan himoya qiladi, shuning uchun
// uning xatti-harakati aniq tekshiriladi: chegara oshgach bloklaydi, oyna
// tugagach tiklanadi, baza yiqilsa esa so'rovni to'smaydi (fail-open).

// shared/db ni soxta ("in-memory") jadval bilan almashtiramiz.
function loadRateLimit({ failRead = false, failWrite = false } = {}) {
  const rows = new Map();
  const key = (scope, k) => `${scope}|${k}`;

  const fakeDb = {
    async request(_client, table, { method = 'GET', query = '', body } = {}) {
      assert.strictEqual(table, 'rate_limits');
      if (method === 'GET') {
        if (failRead) throw new Error('baza yetib bormadi');
        const scope = decodeURIComponent(/scope=eq\.([^&]*)/.exec(query)[1]);
        const k = decodeURIComponent(/key=eq\.([^&]*)/.exec(query)[1]);
        const row = rows.get(key(scope, k));
        return { data: row ? [row] : [] };
      }
      if (failWrite) throw new Error('baza yozmadi');
      rows.set(key(body.scope, body.key), { ...rows.get(key(body.scope, body.key)), ...body });
      return { data: null };
    },
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === './db') return fakeDb;
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../shared/rate-limit')];
  const mod = require('../shared/rate-limit');
  Module._load = originalLoad;
  return { mod, rows };
}

const OPTS = { scope: 'web_code', key: '1.2.3.4', limit: 3, windowSeconds: 600, blockSeconds: 1800 };

test('chegaragacha o\'tkazadi, oshgach bloklaydi', async () => {
  const { mod } = loadRateLimit();
  for (let i = 1; i <= 3; i += 1) {
    const res = await mod.hit(null, OPTS);
    assert.strictEqual(res.allowed, true, `${i}-urinish o'tishi kerak edi`);
  }
  const blocked = await mod.hit(null, OPTS);
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.retryAfter, 1800);
});

test('blok muddati tugamaguncha keyingi urinishlar ham rad etiladi', async () => {
  const { mod } = loadRateLimit();
  for (let i = 0; i < 4; i += 1) await mod.hit(null, OPTS);
  const again = await mod.hit(null, OPTS);
  assert.strictEqual(again.allowed, false);
  assert.ok(again.retryAfter > 0);
});

test('blok muddati o\'tgach yana o\'tkazadi', async () => {
  const { mod, rows } = loadRateLimit();
  for (let i = 0; i < 4; i += 1) await mod.hit(null, OPTS);
  // Blok muddatini o'tmishga surib qo'yamiz
  const row = rows.get('web_code|1.2.3.4');
  row.blocked_until = new Date(Date.now() - 1000).toISOString();
  row.window_start = new Date(Date.now() - 700 * 1000).toISOString();
  const res = await mod.hit(null, OPTS);
  assert.strictEqual(res.allowed, true);
});

test('turli IP lar bir-biriga ta\'sir qilmaydi', async () => {
  const { mod } = loadRateLimit();
  for (let i = 0; i < 4; i += 1) await mod.hit(null, OPTS);
  const other = await mod.hit(null, { ...OPTS, key: '9.9.9.9' });
  assert.strictEqual(other.allowed, true);
});

test('reset() muvaffaqiyatli kirishdan keyin hisoblagichni tozalaydi', async () => {
  const { mod } = loadRateLimit();
  await mod.hit(null, OPTS);
  await mod.hit(null, OPTS);
  await mod.reset(null, 'web_code', '1.2.3.4');
  for (let i = 1; i <= 3; i += 1) {
    assert.strictEqual((await mod.hit(null, OPTS)).allowed, true);
  }
});

test('baza o\'qilmasa so\'rov to\'silmaydi (fail-open)', async () => {
  const { mod } = loadRateLimit({ failRead: true });
  const res = await mod.hit(null, OPTS);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.degraded, true);
});

test('baza yozilmasa ham so\'rov to\'silmaydi', async () => {
  const { mod } = loadRateLimit({ failWrite: true });
  const res = await mod.hit(null, OPTS);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.degraded, true);
});

test('clientIp: Netlify va proksi headerlaridan IP ni oladi', () => {
  const { mod } = loadRateLimit();
  assert.strictEqual(mod.clientIp({ 'x-nf-client-connection-ip': '5.5.5.5' }), '5.5.5.5');
  assert.strictEqual(mod.clientIp({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7' }), '6.6.6.6');
  assert.strictEqual(mod.clientIp({}), 'unknown');
});
