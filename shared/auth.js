const crypto = require('crypto');
const { getEnv } = require('./config');

function sign(value) {
  return crypto.createHmac('sha256', getEnv('SESSION_SECRET', 'dev-secret')).update(value).digest('hex');
}

function createSession() {
  const payload = `${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function isValidSession(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  return sign(payload) === signature;
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
  return password && password === getEnv('ADMIN_PASSWORD');
}

module.exports = {
  createSession,
  requireAdmin,
  verifyPassword,
  parseCookies,
};
