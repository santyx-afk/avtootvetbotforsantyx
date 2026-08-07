const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Testlar uchun haqiqiy kalit (encryption moduli import qilinishidan oldin).
process.env.INVENTORY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { encryptText, decryptText, isEncryptionKeyHealthy } = require('../shared/encryption');
const { resolveAutoAccount, resolveLicenseKey } = require('../shared/delivery-service');

// Boshqa kalit bilan shifrlangan qiymat — "Unsupported state or unable to
// authenticate data" xatosini keltirib chiqaradigan aynan shu holat.
function encryptedWithForeignKey(plain) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

test('round-trips text with the configured key', () => {
  assert.equal(decryptText(encryptText('parol123')), 'parol123');
  assert.equal(isEncryptionKeyHealthy(), true);
});

test('decryptText marks auth-tag failures as decryptionFault', () => {
  try {
    decryptText(encryptedWithForeignKey('parol123'));
    assert.fail('xato kutilgan edi');
  } catch (error) {
    assert.equal(error.decryptionFault, true);
  }
});

test('decryptText rejects structurally invalid ciphertext', () => {
  for (const bad of ['qisqa', 'not-base64!!!', 'YWJj']) {
    assert.throws(() => decryptText(bad), (e) => e.decryptionFault === true);
  }
});

test('REGRESSION: resolveAutoAccount does not throw on undecryptable password', () => {
  const item = { login: 'user@mail.com', password_encrypted: encryptedWithForeignKey('parol123') };
  const failures = [];
  // Ilgari bu yerda xato otilar va butun yetkazish yiqilardi.
  const { login, password } = resolveAutoAccount(item, failures);
  assert.equal(login, 'user@mail.com');
  assert.equal(password, null);
  assert.equal(failures.length, 1, 'nosozlik qayd etilishi kerak');
});

test('REGRESSION: a broken encrypted field does not hide a usable fallback value', () => {
  // password_encrypted buzuq, lekin extra_data ichida yaroqli parol bor.
  const item = {
    login: 'user@mail.com',
    password_encrypted: encryptedWithForeignKey('eski'),
    extra_data: JSON.stringify({ password: 'ishlaydigan-parol' }),
  };
  const failures = [];
  const { password } = resolveAutoAccount(item, failures);
  // Eager argument evaluation tufayli ilgari bu holat ham yiqilardi.
  assert.equal(password, 'ishlaydigan-parol');
  assert.equal(failures.length, 1);
});

test('resolveLicenseKey survives an undecryptable key and reports the failure', () => {
  const failures = [];
  const key = resolveLicenseKey({ license_key_encrypted: encryptedWithForeignKey('KEY-1') }, failures);
  assert.equal(key, null);
  assert.equal(failures.length, 1);
});

test('resolvers stay backward compatible when no failures array is passed', () => {
  // webapp-api collectDeliveries() ikkinchi argumentsiz chaqiradi.
  assert.doesNotThrow(() => resolveAutoAccount({ password_encrypted: encryptedWithForeignKey('x') }));
  assert.doesNotThrow(() => resolveLicenseKey({ license_key_encrypted: encryptedWithForeignKey('x') }));
  const { login, password } = resolveAutoAccount({ login: 'a', password_encrypted: encryptText('b') });
  assert.equal(login, 'a');
  assert.equal(password, 'b');
});

test('healthy inventory item still resolves normally', () => {
  const failures = [];
  const item = { login: 'user@mail.com', password_encrypted: encryptText('parol123') };
  assert.deepEqual(resolveAutoAccount(item, failures), { login: 'user@mail.com', password: 'parol123' });
  assert.equal(failures.length, 0);
});
