const crypto = require('crypto');

// Admin sessiyasi imzo kaliti. Ilgari bu yerda 'dev-secret' zaxira qiymati bor
// edi — repozitoriy ochiq bo'lgani uchun uni bilgan har kim soxta admin cookie
// yasay olardi. Endi kalit majburiy: yo'q bo'lsa sessiya umuman yaratilmaydi
// va tekshiruvdan o'tmaydi (ochiq qolgandan ko'ra ishlamagani xavfsizroq).
function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET o‘rnatilmagan (kamida 16 belgi bo‘lishi kerak)');
  }
  return secret;
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
}

function createSession() {
  const payload = `${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function isValidSession(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const ttlMs = Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 12);
  const ts = Number(payload);
  if (!Number.isFinite(ts) || Date.now() - ts > ttlMs) return false;
  let expected;
  try {
    expected = sign(payload);
  } catch (error) {
    // Kalit sozlanmagan — hech kimni admin deb tan olmaymiz.
    console.error('admin sessiya tekshirilmadi:', error.message);
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(headers = {}) {
  const cookieHeader = headers.cookie || headers.Cookie || '';
  return cookieHeader.split(';').reduce((acc, item) => {
    const [rawKey, ...rest] = item.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function requireAdmin(headers = {}) {
  const cookies = parseCookies(headers);
  return isValidSession(cookies.admin_session);
}

function verifyPassword(password) {
  const input = String(password || '').trim();
  if (!input) return false;
  const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (!envPassword) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(envPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  createSession,
  requireAdmin,
  verifyPassword,
  parseCookies,
};