const crypto = require('crypto');
const { request } = require('./db');

// Brauzer orqali Telegram login uchun bir martalik kodlar.
// Kod 8 xonali: 6 xonalida taxmin qilish maydoni 900 mingta edi, 8 xonalida
// 90 millionga chiqadi — chastota chegarasi ishlamay qolgan holatda ham
// (masalan baza vaqtincha yetib bormasa) brute-force amalda imkonsiz bo'ladi.
const CODE_TTL_MINUTES = 5;
const CODE_LENGTH = 8;

// Eski 6 xonali kodlar deploy paytida hali amal qilib turishi mumkin —
// shuning uchun tekshiruvda 6..8 oralig'i qabul qilinadi.
const MIN_CODE_LENGTH = 6;

function generateCode() {
  // 10000000–99999999 oralig'ida 8 xonali kod
  return String(crypto.randomInt(10 ** (CODE_LENGTH - 1), 10 ** CODE_LENGTH));
}

// Bot /start web_login da chaqiriladi: kod yaratadi va bazaga yozadi.
async function generateWebLoginCode(supabase, telegramId) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString();
  await request(supabase, 'web_auth_codes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: { telegram_id: String(telegramId), code, expires_at: expiresAt, used: false },
  });
  return code;
}

// Brauzer chaqiradi: kodni tekshiradi, to'g'ri bo'lsa telegram_id qaytaradi va kodni "used" qiladi.
async function verifyWebLoginCode(supabase, rawCode) {
  const code = String(rawCode || '').replace(/\D/g, '').slice(0, CODE_LENGTH);
  if (code.length < MIN_CODE_LENGTH) return { ok: false, reason: 'bad_code' };

  const { data } = await request(supabase, 'web_auth_codes', {
    query: `select=id,telegram_id,expires_at,used&code=eq.${code}&used=eq.false&order=created_at.desc&limit=1`,
  });
  const row = data?.[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  // Bir martalik: darhol "used" qilamiz (qayta ishlatib bo'lmaydi)
  await request(supabase, 'web_auth_codes', {
    method: 'PATCH',
    query: `id=eq.${row.id}`,
    body: { used: true },
  }).catch(() => {});

  return { ok: true, telegram_id: String(row.telegram_id) };
}

module.exports = { generateWebLoginCode, verifyWebLoginCode, CODE_TTL_MINUTES, CODE_LENGTH };
