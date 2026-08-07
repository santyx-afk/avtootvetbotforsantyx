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
  // Buffer.from(..., 'base64') noto'g'ri belgilarni jimgina tashlab yuboradi —
  // shuning uchun uzunlikni o'zimiz tekshiramiz (iv 12 + tag 16 + kamida 1 bayt).
  if (buf.length < 29) {
    const error = new Error('Shifrlangan qiymat buzuq (juda qisqa yoki base64 emas)');
    error.decryptionFault = true;
    throw error;
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const payload = buf.subarray(28);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (cause) {
    // AES-GCM autentifikatsiya xatosi ("Unsupported state or unable to authenticate
    // data") — kalit mos kelmadi yoki ma'lumot buzilgan. Chaqiruvchi buni oddiy
    // xatodan ajrata olishi uchun belgilab qo'yamiz.
    const error = new Error(`Shifrni ochib bo‘lmadi: ${cause?.message || 'nomaʼlum xato'}`);
    error.decryptionFault = true;
    throw error;
  }
}

// Kalitning o'zi sozligini tekshiradi (shifrla → ochib ko'r).
// Bitta yozuv ochilmasa: aybdor kalitmi yoki o'sha yozuvmi — shuni ajratish uchun.
// Kalit buzuq bo'lsa hech qaysi akkaunt aybdor emas, ularni karantinga olmaslik kerak.
function isEncryptionKeyHealthy() {
  const probe = 'santyx-key-selftest';
  try {
    return decryptText(encryptText(probe)) === probe;
  } catch {
    return false;
  }
}

module.exports = { encryptText, decryptText, isEncryptionKeyHealthy };
