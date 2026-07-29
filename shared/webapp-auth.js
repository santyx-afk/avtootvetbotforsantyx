const crypto = require('crypto');
const { getEnv } = require('./config');

// Telegram Mini App initData ni bot token bilan HMAC-SHA256 orqali tekshiradi.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Qaytaradi: { ok, user, authDate, reason }
function validateInitData(initData, { maxAgeSeconds = 86400 } = {}) {
  const token = getEnv('TELEGRAM_BOT_TOKEN');
  if (!token) return { ok: false, reason: 'no_token' };
  if (!initData || typeof initData !== 'string') return { ok: false, reason: 'empty' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no_hash' };
  params.delete('hash');

  // data_check_string: qolgan barcha juftliklar alifbo tartibida, \n bilan
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Doimiy vaqtli taqqoslash (timing attack'dan himoya)
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_hash' };
  }

  // Eskirgan initData ni rad etish (replay hujumidan himoya)
  const authDate = Number(params.get('auth_date') || 0);
  if (maxAgeSeconds && authDate) {
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > maxAgeSeconds) return { ok: false, reason: 'expired' };
  }

  let user = null;
  try {
    const userStr = params.get('user');
    if (userStr) user = JSON.parse(userStr);
  } catch {
    /* user parse xatosi — jiddiy emas */
  }

  if (!user?.id) return { ok: false, reason: 'no_user' };

  return { ok: true, user, authDate };
}

/* ============================================================
   Brauzer uchun JWT (HS256) — o'zimizning yengil implementatsiya
   (qo'shimcha paketsiz). Token: { telegram_id, iat, exp }.
   ============================================================ */

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

function jwtSecret() {
  return getEnv('WEB_JWT_SECRET') || getEnv('TELEGRAM_BOT_TOKEN') || 'dev-secret';
}

// 30 kunlik JWT imzolaydi.
function signJwt(payload, { expiresInSeconds = 60 * 60 * 24 * 30 } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const sig = b64url(crypto.createHmac('sha256', jwtSecret()).update(data).digest());
  return `${data}.${sig}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'empty' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', jwtSecret()).update(`${h}.${p}`).digest());
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(p));
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

// Ikki xil auth: Telegram initData (Mini App) yoki JWT (brauzer).
// Qaytaradi: { ok, source: 'telegram'|'jwt', user } yoki { ok:false, reason }.
function authenticate(headers = {}, body = {}) {
  const initData =
    headers['x-telegram-init-data'] || headers['X-Telegram-Init-Data'] || body.initData || '';
  if (initData) {
    const res = validateInitData(initData);
    if (res.ok) return { ok: true, source: 'telegram', user: res.user };
    return { ok: false, reason: res.reason };
  }
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const res = verifyJwt(authHeader.slice(7));
    if (res.ok && res.payload?.telegram_id) {
      return { ok: true, source: 'jwt', user: { id: res.payload.telegram_id } };
    }
    return { ok: false, reason: res.reason || 'bad_token' };
  }
  return { ok: false, reason: 'no_auth' };
}

module.exports = { validateInitData, signJwt, verifyJwt, authenticate };
