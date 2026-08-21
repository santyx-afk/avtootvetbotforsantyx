const { request } = require('./db');

// Ochiq (autentifikatsiyasiz) so'rovlar uchun chastota chegarasi.
// Bitta `rate_limits` jadvali barcha turdagi chegaralarga xizmat qiladi:
// `scope` — qaysi amal (masalan 'web_code'), `key` — kim (odatda IP).
//
// Muhim: jadval yo'q bo'lsa yoki bazaga ulanish uzilsa, chegara O'CHIQ holatda
// qoladi va so'rov o'tkaziladi. Aks holda bitta baza nosozligi butun saytga
// kirishni to'sib qo'yardi. Shuning uchun chegara yagona himoya emas —
// masalan kirish kodi bundan tashqari 8 xonali qilib uzaytirilgan.

// Netlify so'rovidan mijoz IP sini oladi.
function clientIp(headers = {}) {
  const h = headers || {};
  return (
    h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    h['client-ip'] ||
    'unknown'
  );
}

async function readRow(supabase, scope, key) {
  const { data } = await request(supabase, 'rate_limits', {
    query: `select=*&scope=eq.${encodeURIComponent(scope)}&key=eq.${encodeURIComponent(key)}&limit=1`,
  });
  return data?.[0] || null;
}

async function writeRow(supabase, scope, key, patch) {
  await request(supabase, 'rate_limits', {
    method: 'POST',
    query: 'on_conflict=scope,key',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: { scope, key, updated_at: new Date().toISOString(), ...patch },
  });
}

// Bitta urinishni hisobga oladi va ruxsat berilishini qaytaradi.
//   limit         — oynadagi maksimal urinishlar soni
//   windowSeconds — hisoblash oynasi
//   blockSeconds  — limit oshib ketganda necha soniya bloklash
// Qaytaradi: { allowed: true } yoki { allowed: false, retryAfter }
async function hit(supabase, { scope, key, limit, windowSeconds, blockSeconds }) {
  const now = Date.now();
  let row;
  try {
    row = await readRow(supabase, scope, key);
  } catch (error) {
    console.warn(`rate-limit: ${scope} o'qilmadi (chegara o'chiq) —`, error?.message);
    return { allowed: true, degraded: true };
  }

  if (row?.blocked_until && new Date(row.blocked_until).getTime() > now) {
    const retryAfter = Math.ceil((new Date(row.blocked_until).getTime() - now) / 1000);
    return { allowed: false, retryAfter };
  }

  const windowExpired =
    !row?.window_start || now - new Date(row.window_start).getTime() > windowSeconds * 1000;
  const attempts = windowExpired ? 1 : Number(row.attempts || 0) + 1;
  const exceeded = attempts > limit;
  const blockedUntil = exceeded ? new Date(now + blockSeconds * 1000).toISOString() : null;

  try {
    await writeRow(supabase, scope, key, {
      attempts: exceeded ? 0 : attempts,
      window_start: windowExpired ? new Date(now).toISOString() : row.window_start,
      blocked_until: blockedUntil,
    });
  } catch (error) {
    console.warn(`rate-limit: ${scope} yozilmadi (chegara o'chiq) —`, error?.message);
    return { allowed: true, degraded: true };
  }

  if (exceeded) return { allowed: false, retryAfter: blockSeconds };
  return { allowed: true };
}

// Muvaffaqiyatli amaldan keyin hisoblagichni tozalaydi (masalan to'g'ri kod kiritilgach).
async function reset(supabase, scope, key) {
  try {
    await writeRow(supabase, scope, key, {
      attempts: 0,
      window_start: new Date().toISOString(),
      blocked_until: null,
    });
  } catch {
    /* muhim emas */
  }
}

module.exports = { hit, reset, clientIp };
