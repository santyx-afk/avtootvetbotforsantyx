const { request, rpcRequest } = require('./db');

// Ochiq (autentifikatsiyasiz) so'rovlar uchun chastota chegarasi.
// Bitta `rate_limits` jadvali barcha turdagi chegaralarga xizmat qiladi:
// `scope` — qaysi amal (masalan 'web_code'), `key` — kim (odatda IP).
//
// Hisoblash bazadagi atomik `rate_limit_hit` funksiyasida bajariladi
// (migrations/2026-08-24_rate-limit-atomic.sql). JS tarafda "o'qi → yoz"
// qilinsa, parallel so'rovlar bir xil hisoblagichni ko'rib chegarani
// sezdirmay chetlab o'tishi mumkin edi — login kodi 4 xonali bo'lgani
// uchun bunga yo'l qo'yib bo'lmaydi.
//
// Baza yetib bormasa nima bo'lishi chaqiruvchiga bog'liq:
//   failClosed: false (odatiy) — so'rov O'TKAZILADI. Lead formasi kabi
//     amallarda bitta baza nosozligi butun formani to'sib qo'ymasin.
//   failClosed: true — so'rov RAD ETILADI. Kirish kodini tekshirish uchun
//     shart: chegarasiz qolgan 4 xonali kod daqiqalarda topiladi, kod
//     qidiruvining o'zi ham o'sha bazaga muhtoj — demak yo'qotish yo'q.

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

// Bitta urinishni hisobga oladi va ruxsat berilishini qaytaradi.
//   limit         — oynadagi maksimal urinishlar soni
//   windowSeconds — hisoblash oynasi
//   blockSeconds  — limit oshib ketganda necha soniya bloklash
//   failClosed    — baza javob bermasa rad etish (yuqoridagi izohga qarang)
// Qaytaradi: { allowed: true } yoki { allowed: false, retryAfter }
async function hit(supabase, { scope, key, limit, windowSeconds, blockSeconds, failClosed = false }) {
  try {
    const verdict = await rpcRequest(supabase, 'rate_limit_hit', {
      p_scope: scope,
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
      p_block_seconds: blockSeconds,
    });
    if (verdict?.allowed === true) return { allowed: true };
    if (verdict?.allowed === false) {
      return { allowed: false, retryAfter: Number(verdict.retry_after) || blockSeconds };
    }
    throw new Error(`kutilmagan javob: ${JSON.stringify(verdict)}`);
  } catch (error) {
    console.warn(`rate-limit: ${scope} tekshirilmadi —`, error?.message);
    if (failClosed) return { allowed: false, retryAfter: 60, degraded: true };
    return { allowed: true, degraded: true };
  }
}

// Muvaffaqiyatli amaldan keyin hisoblagichni tozalaydi (masalan to'g'ri kod kiritilgach).
async function reset(supabase, scope, key) {
  try {
    await request(supabase, 'rate_limits', {
      method: 'POST',
      query: 'on_conflict=scope,key',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: {
        scope,
        key,
        attempts: 0,
        window_start: new Date().toISOString(),
        blocked_until: null,
        updated_at: new Date().toISOString(),
      },
    });
  } catch {
    /* muhim emas */
  }
}

module.exports = { hit, reset, clientIp };
