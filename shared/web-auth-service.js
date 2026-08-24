const crypto = require('crypto');
const { request } = require('./db');

// Brauzer orqali Telegram login uchun bir martalik kodlar.
//
// Kod 4 xonali — foydalanuvchi uni telefondagi botdan qarab brauzerga
// ko'chiradi, qisqa kod ancha qulay. 4 xonada taxmin maydoni atigi 9 000 ta,
// shuning uchun himoya kod uzunligida emas, tekshiruv tarafida (webapp-api.js):
//   - IP boshiga atomik chastota chegarasi (10 daqiqada 5 urinish, keyin blok);
//   - hamma IP lar uchun umumiy to'siq (ko'p IP li hujumga qarshi);
//   - chegara bazaga yetib bormasa tekshiruv YOPILADI (failClosed).
const CODE_TTL_MINUTES = 5;
const CODE_LENGTH = 4;

// Deploy o'tish davrida eski 8 xonali kodlar hali amalda bo'lishi mumkin —
// tekshiruv 4..8 xonani qabul qiladi (baribir bazadan aniq kod qidiriladi,
// shuning uchun uzunroq kirish hech narsani yumshatmaydi).
const MAX_CODE_LENGTH = 8;

// 4 xonada to'qnashuv ehtimoli endi real: bir vaqtda bir nechta faol kod
// bo'lsa, ikkitasi bir xil chiqib qolishi mumkin — u holda kodni kiritgan
// odam BOSHQA birovning hisobiga tushardi. Shuning uchun generatsiya faol
// dublikatni tekshiradi va topilsa qayta uradi.
const MAX_GENERATE_TRIES = 5;

function generateCode() {
  // 1000–9999 oralig'ida 4 xonali kod
  return String(crypto.randomInt(10 ** (CODE_LENGTH - 1), 10 ** CODE_LENGTH));
}

// Bot /start web_login da chaqiriladi: kod yaratadi va bazaga yozadi.
async function generateWebLoginCode(supabase, telegramId) {
  const nowIso = new Date().toISOString();

  // Shu foydalanuvchining oldingi kodlari bekor bo'ladi (oxirgisi amal
  // qiladi), muddati o'tganlar esa jadvalda to'planib to'qnashuv maydonini
  // toraytirmasin — ikkalasi bitta so'rovda o'chiriladi.
  await request(supabase, 'web_auth_codes', {
    method: 'DELETE',
    query: `or=(telegram_id.eq.${telegramId},expires_at.lt.${nowIso})`,
  }).catch(() => {});

  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString();
  for (let attempt = 0; attempt < MAX_GENERATE_TRIES; attempt += 1) {
    const code = generateCode();
    const { data: clash } = await request(supabase, 'web_auth_codes', {
      query: `select=id&code=eq.${code}&used=eq.false&expires_at=gt.${nowIso}&limit=1`,
    });
    if (clash?.length) continue;
    await request(supabase, 'web_auth_codes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: { telegram_id: String(telegramId), code, expires_at: expiresAt, used: false },
    });
    return code;
  }
  // 9 000 talik maydonda 5 marta ketma-ket to'qnashuv — amalda uchramaydi.
  throw new Error('web_login: bo\'sh kod topilmadi');
}

// Brauzer chaqiradi: kodni tekshiradi, to'g'ri bo'lsa telegram_id qaytaradi va kodni "used" qiladi.
async function verifyWebLoginCode(supabase, rawCode) {
  const code = String(rawCode || '').replace(/\D/g, '').slice(0, MAX_CODE_LENGTH);
  if (code.length < CODE_LENGTH) return { ok: false, reason: 'bad_code' };

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
