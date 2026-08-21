const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// Autentifikatsiya — pul va shaxsiy ma'lumot shu yerdan o'tadi, shuning uchun
// aynan RAD ETISH holatlari tekshiriladi: soxta imzo, eskirgan token,
// buzilgan initData va kalitsiz ishlash.

const BOT_TOKEN = '123456:test-bot-token';

function loadAuth(env = {}) {
  // Modul kalitni chaqiruv paytida o'qiydi, shuning uchun env ni oldin qo'yamiz.
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete require.cache[require.resolve('../shared/webapp-auth')];
  return require('../shared/webapp-auth');
}

// Telegram hujjatidagi algoritm bo'yicha haqiqiy initData yasaydi.
function makeInitData(token, { user = { id: 42, first_name: 'Test' }, authDate } = {}) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate ?? Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify(user));
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

test('validateInitData: haqiqiy initData qabul qilinadi', () => {
  const { validateInitData } = loadAuth({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
  const res = validateInitData(makeInitData(BOT_TOKEN));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.user.id, 42);
});

test('validateInitData: boshqa bot tokeni bilan imzolangan ma\'lumot rad etiladi', () => {
  const { validateInitData } = loadAuth({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
  const res = validateInitData(makeInitData('999:boshqa-token'));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'bad_hash');
});

test('validateInitData: buzilgan (o\'zgartirilgan) ma\'lumot rad etiladi', () => {
  const { validateInitData } = loadAuth({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
  const good = makeInitData(BOT_TOKEN);
  // user.id ni 42 dan 99 ga almashtiramiz — hash endi mos kelmaydi.
  // URLSearchParams kodlashida id shunday ko'rinadi: ...%22id%22%3A42%2C...
  const tampered = good.replace('%3A42%2C', '%3A99%2C');
  assert.notStrictEqual(tampered, good, 'test o‘zi ishlashi uchun matn haqiqatan o‘zgarishi kerak');
  const res = validateInitData(tampered);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'bad_hash');
});

test('validateInitData: eskirgan initData rad etiladi', () => {
  const { validateInitData } = loadAuth({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
  const old = makeInitData(BOT_TOKEN, { authDate: Math.floor(Date.now() / 1000) - 90000 });
  const res = validateInitData(old);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'expired');
});

test('validateInitData: hash yo\'q bo\'lsa rad etiladi', () => {
  const { validateInitData } = loadAuth({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
  assert.strictEqual(validateInitData('user=%7B%22id%22%3A1%7D').reason, 'no_hash');
  assert.strictEqual(validateInitData('').reason, 'empty');
});

test('JWT: imzolangan token o\'qiladi, buzilgani rad etiladi', () => {
  const { signJwt, verifyJwt } = loadAuth({ WEB_JWT_SECRET: 'test-secret-key-1234567890' });
  const token = signJwt({ telegram_id: '777' });
  assert.strictEqual(verifyJwt(token).payload.telegram_id, '777');

  // Imzoni o'zgartiramiz
  const [h, p] = token.split('.');
  assert.strictEqual(verifyJwt(`${h}.${p}.soxtaimzo`).ok, false);
  // Payload'ni o'zgartiramiz (boshqa telegram_id)
  const evil = Buffer.from(JSON.stringify({ telegram_id: '1', exp: 9999999999 }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.strictEqual(verifyJwt(`${h}.${evil}.${token.split('.')[2]}`).ok, false);
});

test('JWT: muddati o\'tgan token rad etiladi', () => {
  const { signJwt, verifyJwt } = loadAuth({ WEB_JWT_SECRET: 'test-secret-key-1234567890' });
  const token = signJwt({ telegram_id: '777' }, { expiresInSeconds: -10 });
  assert.strictEqual(verifyJwt(token).reason, 'expired');
});

test('JWT: kalit umuman yo\'q bo\'lsa token tan olinmaydi', () => {
  const { verifyJwt } = loadAuth({ WEB_JWT_SECRET: undefined, TELEGRAM_BOT_TOKEN: undefined });
  // 'dev-secret' zaxira qiymati olib tashlangan — kalitsiz hech nima tekshirilmaydi
  assert.strictEqual(verifyJwt('a.b.c').ok, false);
});

test('authenticate: auth ma\'lumoti bo\'lmasa rad etiladi', () => {
  const { authenticate } = loadAuth({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
  assert.deepStrictEqual(authenticate({}, {}), { ok: false, reason: 'no_auth' });
});

test('authenticate: Bearer token orqali foydalanuvchi aniqlanadi', () => {
  const auth = loadAuth({ WEB_JWT_SECRET: 'test-secret-key-1234567890', TELEGRAM_BOT_TOKEN: BOT_TOKEN });
  const token = auth.signJwt({ telegram_id: '555' });
  const res = auth.authenticate({ authorization: `Bearer ${token}` }, {});
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.source, 'jwt');
  assert.strictEqual(res.user.id, '555');
});
