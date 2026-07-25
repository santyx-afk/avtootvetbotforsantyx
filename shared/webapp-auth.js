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

module.exports = { validateInitData };
