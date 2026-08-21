const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Brauzer orqali kirish kodi — hisobni egallashning eng qisqa yo'li bo'lgani
// uchun kod uzunligi va tekshiruv qoidalari alohida tekshiriladi.

function loadService() {
  const rows = [];
  const fakeDb = {
    async request(_client, table, { method = 'GET', query = '', body } = {}) {
      assert.strictEqual(table, 'web_auth_codes');
      if (method === 'POST') {
        rows.push({ id: rows.length + 1, ...body });
        return { data: null };
      }
      if (method === 'PATCH') {
        const id = Number(/id=eq\.(\d+)/.exec(query)[1]);
        Object.assign(rows.find((r) => r.id === id), body);
        return { data: null };
      }
      const code = /code=eq\.([^&]*)/.exec(query)[1];
      const found = rows.filter((r) => r.code === code && r.used === false);
      return { data: found.slice(-1) };
    },
  };
  const originalLoad = Module._load;
  Module._load = function (request) {
    if (request === './db') return fakeDb;
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../shared/web-auth-service')];
  const mod = require('../shared/web-auth-service');
  Module._load = originalLoad;
  return { mod, rows };
}

test('kod 8 xonali bo\'ladi (taxmin qilish maydoni 90 mln)', async () => {
  const { mod } = loadService();
  assert.strictEqual(mod.CODE_LENGTH, 8);
  for (let i = 0; i < 20; i += 1) {
    const code = await mod.generateWebLoginCode(null, '111');
    assert.match(code, /^\d{8}$/, `noto'g'ri kod: ${code}`);
  }
});

test('to\'g\'ri kod telegram_id qaytaradi', async () => {
  const { mod } = loadService();
  const code = await mod.generateWebLoginCode(null, '424242');
  const res = await mod.verifyWebLoginCode(null, code);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.telegram_id, '424242');
});

test('kod bir martalik — ikkinchi marta ishlamaydi', async () => {
  const { mod } = loadService();
  const code = await mod.generateWebLoginCode(null, '5');
  assert.strictEqual((await mod.verifyWebLoginCode(null, code)).ok, true);
  const second = await mod.verifyWebLoginCode(null, code);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'not_found');
});

test('mavjud bo\'lmagan kod rad etiladi', async () => {
  const { mod } = loadService();
  await mod.generateWebLoginCode(null, '5');
  const res = await mod.verifyWebLoginCode(null, '00000000');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'not_found');
});

test('juda qisqa kod formatdan o\'tmaydi', async () => {
  const { mod } = loadService();
  for (const bad of ['', '1', '12345', 'abcd', null]) {
    const res = await mod.verifyWebLoginCode(null, bad);
    assert.strictEqual(res.ok, false, `qabul qilinmasligi kerak: ${bad}`);
    assert.strictEqual(res.reason, 'bad_code');
  }
});

test('muddati o\'tgan kod rad etiladi', async () => {
  const { mod, rows } = loadService();
  const code = await mod.generateWebLoginCode(null, '7');
  rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
  const res = await mod.verifyWebLoginCode(null, code);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'expired');
});
