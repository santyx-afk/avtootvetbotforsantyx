const crypto = require('crypto');

function getKey() {
  const raw = process.env.INVENTORY_ENCRYPTION_KEY;
  if (!raw) throw new Error('INVENTORY_ENCRYPTION_KEY o‘rnatilmagan');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('INVENTORY_ENCRYPTION_KEY 32-byte base64 bo‘lishi kerak');
  return key;
}

function encryptText(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptText(cipherText) {
  if (!cipherText) return null;
  const buf = Buffer.from(String(cipherText), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const payload = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encryptText, decryptText };
