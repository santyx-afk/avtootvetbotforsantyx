const crypto = require('crypto');
const { request } = require('./db');

// Brauzer orqali Telegram login uchun bir martalik 6 xonali kodlar.
const CODE_TTL_MINUTES = 5;

function generateCode() {
  // 100000–999999 oralig'ida 6 xonali kod
  return String(crypto.randomInt(100000, 1000000));
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
  const code = String(rawCode || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) return { ok: false, reason: 'bad_code' };

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

module.exports = { generateWebLoginCode, verifyWebLoginCode, CODE_TTL_MINUTES };
