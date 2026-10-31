// Trafik manbasini (acquisition source) aniqlash va normallashtirish.
//
// Nima uchun alohida modul: bitta manba uch xil yo'ldan kirib keladi —
// bot deep-link (?start=...), sayt URL (?utm_source=... / ?src=...) va
// Mini App start_param. Qoidalar bir joyda bo'lmasa, uchta joyda uch xil
// yozilib ketadi va hisobotda "reels_03", "Reels-03", "reels 3" alohida
// qatorlar bo'lib ko'rinadi.
//
// Barcha funksiyalar sof (pure) — test qilish uchun baza kerak emas.

// Telegram deep-link payload'i 64 belgidan oshmaydi, lekin hisobotda
// o'qiydigan bo'lishi uchun o'zimiz 40 bilan cheklaymiz.
const SOURCE_MAX_LEN = 40;

// Botning o'z ichki payload'lari — bular manba EMAS (funksional buyruqlar).
const RESERVED_PAYLOADS = new Set(['web_login', 'support']);

// Slug: kichik harf, raqam, pastki chiziq va tire. Qolgani tashlanadi.
// Sabab: manba kaliti hisobot jadvalining birlamchi kaliti bo'ladi —
// bo'sh joy, emoji yoki kirill harflari bo'lsa taqqoslash buziladi.
function normalizeSourceSlug(raw) {
  if (raw === null || raw === undefined) return null;
  const slug = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, SOURCE_MAX_LEN)
    // slice'dan keyin oxirida yana ajratuvchi qolishi mumkin
    .replace(/[_-]+$/g, '');
  return slug || null;
}

// Bot deep-link payload'idan manbani ajratadi.
//
// Qabul qilinadigan shakllar:
//   ?start=src_instagram_bio  → 'instagram_bio'  (umumiy shakl)
//   ?start=reels_07           → 'reels_07'       (Reels uchun qisqa shakl —
//                                                 havola og'zaki aytishga qulay)
//   ?start=ref_12345          → 'referral'       (referal — kim taklif qilgani
//                                                 referrals jadvalida, bu yerda
//                                                 faqat kanal nomi muhim)
//   ?start=web_login | support → null            (ichki buyruq, manba emas)
function parseStartPayloadSource(payload) {
  const raw = String(payload || '').trim();
  if (!raw) return null;
  if (RESERVED_PAYLOADS.has(raw)) return null;
  if (/^ref_\d+$/.test(raw)) return 'referral';
  if (/^src[_-]/i.test(raw)) return normalizeSourceSlug(raw.slice(4));
  if (/^reels[_-]?\d{1,3}$/i.test(raw)) {
    const num = raw.match(/(\d{1,3})$/)[1];
    // reels_7 va reels_07 bitta manba bo'lishi kerak — ikki xonaga keltiramiz.
    return `reels_${num.padStart(2, '0')}`;
  }
  // Tanilmagan payload — manba deb qabul qilamiz (yangi havolani kodga
  // tegmasdan ishga tushirish mumkin bo'lsin), lekin normallashtirilgan holda.
  return normalizeSourceSlug(raw);
}

// Sayt URL parametrlaridan manba. utm_source standart, ?src= qisqa variant.
// Reels uchun ?src=reels_07 ham, ?utm_source=instagram&utm_content=reels_07
// ham ishlaydi — ikkinchisida aniqroq bo'lgani (utm_content) tanlanadi.
function parseWebSource(params = {}) {
  const get = (key) => {
    const value = typeof params.get === 'function' ? params.get(key) : params[key];
    return value === null || value === undefined ? '' : String(value);
  };
  const content = get('utm_content');
  // utm_content faqat Reels/kreativ kodini bildirsa ishlatiladi; aks holda
  // u ko'pincha "button1" kabi ma'nosiz qiymat bo'ladi.
  if (/^reels[_-]?\d{1,3}$/i.test(content.trim())) {
    return parseStartPayloadSource(content.trim());
  }
  const direct = get('src') || get('utm_source') || get('ref');
  return normalizeSourceSlug(direct);
}

// Hisobot va admin panel uchun o'qiydigan nom. Lug'atda (traffic_sources)
// label bo'lsa o'sha, bo'lmasa slug'dan chiroyli nom yasaydi.
function sourceLabel(slug, dictionary = {}) {
  if (!slug) return 'Noma’lum';
  if (dictionary[slug]?.label) return dictionary[slug].label;
  const m = String(slug).match(/^reels_(\d+)$/);
  if (m) return `Reels #${m[1]}`;
  return String(slug).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

// Manba qaysi guruhga tegishli — admin panelda guruhlab ko'rsatish uchun.
function sourceKind(slug) {
  if (!slug) return 'other';
  if (/^reels_/.test(slug)) return 'reels';
  if (/^instagram/.test(slug)) return 'instagram';
  if (/^(telegram|tg)/.test(slug)) return 'telegram';
  if (/^chatla/.test(slug)) return 'chatla';
  if (slug === 'website' || slug === 'web' || slug === 'site') return 'web';
  if (slug === 'referral') return 'referral';
  return 'other';
}

module.exports = {
  SOURCE_MAX_LEN,
  normalizeSourceSlug,
  parseStartPayloadSource,
  parseWebSource,
  sourceLabel,
  sourceKind,
};
