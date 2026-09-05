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

function b64url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value) {
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

// Rollar: owner — hamma narsa; operator — faqat operatsion ishlar
// (buyurtma tasdiqlash/rad etish, qo'lda yetkazish, inventar qo'shish,
// leadlar, sharhlar, mijozga xabar). Pul, sozlamalar, promokod, kredensial
// ochish, broadcast — faqat owner.
const ROLES = ['owner', 'operator'];

// Sessiya: base64url(JSON{t,r,u}).imzo. Eski format (faqat vaqt tamg'asi)
// ham qabul qilinadi — egasi sifatida (deploy paytida hech kim chiqib ketmasin).
function createSession({ role = 'owner', username = 'owner' } = {}) {
  const payload = b64url(JSON.stringify({ t: Date.now(), r: ROLES.includes(role) ? role : 'operator', u: String(username || '') }));
  return `${payload}.${sign(payload)}`;
}

function parseSession(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  let expected;
  try {
    expected = sign(payload);
  } catch (error) {
    // Kalit sozlanmagan — hech kimni admin deb tan olmaymiz.
    console.error('admin sessiya tekshirilmadi:', error.message);
    return null;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let ts;
  let role = 'owner';
  let username = 'owner';
  if (/^\d+$/.test(payload)) {
    ts = Number(payload); // eski format
  } else {
    try {
      const data = JSON.parse(b64urlDecode(payload));
      ts = Number(data.t);
      role = ROLES.includes(data.r) ? data.r : 'operator';
      username = String(data.u || '');
    } catch {
      return null;
    }
  }
  // Operator sessiyasi qisqaroq (2 soat): o'chirilgan operator uzoq
  // ishlab qolmasin (panel ochilganda admin-session faolligini ham tekshiradi).
  const ttlMs = role === 'operator'
    ? Number(process.env.ADMIN_OPERATOR_SESSION_TTL_MS || 1000 * 60 * 60 * 2)
    : Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 12);
  if (!Number.isFinite(ts) || Date.now() - ts > ttlMs) return null;
  return { role, username, issuedAt: ts };
}

function isValidSession(token) {
  return Boolean(parseSession(token));
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

// Joriy sessiya (rol bilan) yoki null.
function getSession(headers = {}) {
  const cookies = parseCookies(headers);
  return parseSession(cookies.admin_session);
}

function requireAdmin(headers = {}) {
  return Boolean(getSession(headers));
}

// Faqat egasi uchun amallar.
function requireOwner(headers = {}) {
  return getSession(headers)?.role === 'owner';
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

// Operator parollari: scrypt (Node ichida, qo'shimcha paketsiz).
// Format: scrypt$<salt hex>$<hash hex>
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPasswordHash(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const hash = crypto.scryptSync(String(password || ''), parts[1], 64);
  const expected = Buffer.from(parts[2], 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

module.exports = {
  createSession,
  parseSession,
  isValidSession,
  getSession,
  requireAdmin,
  requireOwner,
  verifyPassword,
  hashPassword,
  verifyPasswordHash,
  parseCookies,
  ROLES,
};
