const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Brauzer orqali kirish kodi — hisobni egallashning eng qisqa yo'li bo'lgani
// uchun kod uzunligi va tekshiruv qoidalari alohida tekshiriladi.
// Kod 4 xonali bo'lgani sabab generatsiya qoidalari ham muhim: eski kodlar
// o'chishi, to'qnashuvda qayta urish — bularsiz bir foydalanuvchi boshqa
// birovning hisobiga tushib qolishi mumkin edi.

function loadService({ clashFirst = 0 } = {}) {
  const rows = [];
  const state = { clashLeft: clashFirst, dupChecks: 0, inserts: 0 };
  let nextId = 1;
  const fakeDb = {
    async request(_client, table, { method = 'GET', query = '', body } = {}) {
      assert.strictEqual(table, 'web_auth_codes');
      if (method === 'POST') {
        state.inserts += 1;
        rows.push({ id: nextId, ...body });
        nextId += 1;
        return { data: null };
      }
      if (method === 'PATCH') {
        const id = Number(/id=eq\.(\d+)/.exec(query)[1]);
        Object.assign(rows.find((r) => r.id === id), body);
        return { data: null };
      }
      if (method === 'DELETE') {
        const m = /or=\(telegram_id\.eq\.([^,]+),expires_at\.lt\.([^)]+)\)/.exec(query);
        assert.ok(m, `kutilmagan DELETE so'rovi: ${query}`);
        const cutoff = new Date(m[2]).getTime();
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (String(rows[i].telegram_id) === m[1] || new Date(rows[i].expires_at).getTime() < cutoff) {
            rows.splice(i, 1);
          }
        }
        return { data: null };
      }
      // GET ikki xil: generatsiyadagi dublikat tekshiruvi (expires_at=gt bilan)
      // yoki brauzerdan kelgan kodni qidirish.
      const code = /code=eq\.([^&]*)/.exec(query)[1];
      if (query.includes('expires_at=gt.')) {
        state.dupChecks += 1;
        if (state.clashLeft > 0) {
          state.clashLeft -= 1;
          return { data: [{ id: 0 }] };
        }
        const clash = rows.filter((r) => r.code === code && r.used === false);
        return { data: clash.slice(0, 1) };
      }
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
  return { mod, rows, state };
}

test('kod 4 xonali bo\'ladi (himoya IP chegaralarida, kod uzunligida emas)', async () => {
  const { mod } = loadService();
  assert.strictEqual(mod.CODE_LENGTH, 4);
  for (let i = 0; i < 20; i += 1) {
    const code = await mod.generateWebLoginCode(null, '111');
    assert.match(code, /^\d{4}$/, `noto'g'ri kod: ${code}`);
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
  // Generatsiya 1000–9999 oralig'ida, shuning uchun '0000' hech qachon chiqmaydi.
  const res = await mod.verifyWebLoginCode(null, '0000');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'not_found');
});

test('juda qisqa kod formatdan o\'tmaydi', async () => {
  const { mod } = loadService();
  for (const bad of ['', '1', '123', 'abc', null]) {
    const res = await mod.verifyWebLoginCode(null, bad);
    assert.strictEqual(res.ok, false, `qabul qilinmasligi kerak: ${bad}`);
    assert.strictEqual(res.reason, 'bad_code');
  }
});

test('eski 8 xonali kod deploy o\'tish davrida hali qabul qilinadi', async () => {
  const { mod, rows } = loadService();
  rows.push({
    id: 900,
    telegram_id: '9',
    code: '12345678',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    used: false,
  });
  const res = await mod.verifyWebLoginCode(null, '12345678');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.telegram_id, '9');
});

test('muddati o\'tgan kod rad etiladi', async () => {
  const { mod, rows } = loadService();
  const code = await mod.generateWebLoginCode(null, '7');
  rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
  const res = await mod.verifyWebLoginCode(null, code);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'expired');
});

test('yangi kod so\'ralganda o\'sha foydalanuvchining eskisi bekor bo\'ladi', async () => {
  const { mod, rows } = loadService();
  const first = await mod.generateWebLoginCode(null, '42');
  const second = await mod.generateWebLoginCode(null, '42');
  assert.strictEqual(rows.filter((r) => r.telegram_id === '42').length, 1, 'faqat oxirgi kod qolishi kerak');
  if (first !== second) {
    const stale = await mod.verifyWebLoginCode(null, first);
    assert.strictEqual(stale.ok, false, 'eski kod ishlamasligi kerak');
  }
  assert.strictEqual((await mod.verifyWebLoginCode(null, second)).ok, true);
});

test('muddati o\'tgan yozuvlar generatsiyada tozalanadi', async () => {
  const { mod, rows } = loadService();
  rows.push({
    id: 901,
    telegram_id: '1',
    code: '1111',
    expires_at: new Date(Date.now() - 1000).toISOString(),
    used: false,
  });
  await mod.generateWebLoginCode(null, '2');
  assert.ok(rows.every((r) => r.telegram_id !== '1'), 'eskirgan yozuv o\'chishi kerak');
});

test('faol dublikat chiqsa kod qayta generatsiya qilinadi', async () => {
  const { mod, state } = loadService({ clashFirst: 2 });
  const code = await mod.generateWebLoginCode(null, '77');
  assert.match(code, /^\d{4}$/);
  assert.strictEqual(state.dupChecks, 3, 'ikki to\'qnashuvdan keyin uchinchi urinish');
  assert.strictEqual(state.inserts, 1, 'faqat bitta kod yozilishi kerak');
});
