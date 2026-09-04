const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-secret-at-least-16-chars';
const { createSession, parseSession, requireOwner, requireAdmin, hashPassword, verifyPasswordHash } = require('../shared/auth');

test('sessiya: egasi va operator rollari saqlanadi', () => {
  const owner = parseSession(createSession({ role: 'owner', username: 'owner' }));
  assert.equal(owner.role, 'owner');
  const op = parseSession(createSession({ role: 'operator', username: 'ali' }));
  assert.equal(op.role, 'operator');
  assert.equal(op.username, 'ali');
  // noma'lum rol — operator (kam huquq)
  assert.equal(parseSession(createSession({ role: 'root', username: 'x' })).role, 'operator');
});

test('sessiya: imzo buzilsa qabul qilinmaydi', () => {
  const token = createSession({ role: 'owner' });
  const [payload] = token.split('.');
  assert.equal(parseSession(`${payload}.deadbeef`), null);
  // payload'ni operator→owner ga o'zgartirib bo'lmaydi
  const forged = Buffer.from(JSON.stringify({ t: Date.now(), r: 'owner', u: 'x' })).toString('base64url');
  assert.equal(parseSession(`${forged}.${token.split('.')[1]}`), null);
});

test('sessiya: eski format (faqat vaqt) egasi sifatida qabul qilinadi', () => {
  const crypto = require('crypto');
  const payload = String(Date.now());
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('hex');
  const s = parseSession(`${payload}.${sig}`);
  assert.equal(s.role, 'owner');
});

test('requireOwner / requireAdmin cookie bo\'yicha', () => {
  const opCookie = { cookie: `admin_session=${createSession({ role: 'operator', username: 'ali' })}` };
  const ownCookie = { cookie: `admin_session=${createSession({ role: 'owner' })}` };
  assert.equal(requireAdmin(opCookie), true);
  assert.equal(requireOwner(opCookie), false);
  assert.equal(requireOwner(ownCookie), true);
  assert.equal(requireAdmin({}), false);
});

test('parol hash: to\'g\'ri parol o\'tadi, noto\'g\'risi yo\'q', () => {
  const stored = hashPassword('sekret123');
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(verifyPasswordHash('sekret123', stored), true);
  assert.equal(verifyPasswordHash('sekret124', stored), false);
  assert.equal(verifyPasswordHash('sekret123', 'garbage'), false);
});
