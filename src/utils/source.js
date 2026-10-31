// Trafik manbasini brauzer tomonida ushlash.
//
// Odam santyx.uz/?utm_source=instagram&utm_content=reels_07 bilan keladi,
// lekin xaridni ko'pincha BIR NECHA sahifa yoki hatto bir necha kundan keyin
// qiladi — URL parametrlari esa birinchi o'tishda yo'qoladi. Shuning uchun
// manba localStorage'ga YOZILADI va keyin `init` so'rovi bilan serverga
// yuboriladi.
//
// Qoida: BIRINCHI TEGINISH. Saqlangan manba bo'lsa, yangi URL parametri uni
// almashtirmaydi — reklama budjeti kimga tegishli ekani o'zgarmaydi. Server
// tomonida ham xuddi shu qoida (shared/db.js → stampUserSource) va qiymat
// qayta normallashtiriladi (shared/source.js) — bu fayl "yumshoq" qatlam.

const KEY = 'santyx:source';

// shared/source.js dagi normalizeSourceSlug bilan bir xil qoida.
// Nusxa ataylab: bu fayl brauzerda (ESM) ishlaydi, u yerda Node (CJS).
// Yakuniy haqiqat — SERVER tomoni; bu yerda faqat chiroyli havola yasash uchun.
function normalize(raw) {
  if (!raw) return null;
  const slug = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 40)
    .replace(/[_-]+$/g, '');
  return slug || null;
}

function readStored() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

function store(slug) {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    /* private rejim — manba shu sessiyada ishlatiladi, saqlanmaydi */
  }
}

// URL'dan manbani ajratadi: ?src=... | ?utm_source=... ; Reels kodi
// ?utm_content=reels_07 da bo'lsa, u aniqroq bo'lgani uchun ustun turadi.
export function sourceFromSearch(search = '') {
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const content = (params.get('utm_content') || '').trim();
  if (/^reels[_-]?\d{1,3}$/i.test(content)) {
    const num = content.match(/(\d{1,3})$/)[1];
    return `reels_${num.padStart(2, '0')}`;
  }
  return normalize(params.get('src') || params.get('utm_source') || params.get('ref'));
}

// Telegram Mini App start_param: t.me/<bot>/app?startapp=src_reels_07
export function sourceFromStartParam(startParam) {
  const raw = String(startParam || '').trim();
  if (!raw) return null;
  if (raw === 'web_login' || raw === 'support' || /^ref_\d+$/.test(raw)) return null;
  if (/^src[_-]/i.test(raw)) return normalize(raw.slice(4));
  if (/^reels[_-]?\d{1,3}$/i.test(raw)) {
    const num = raw.match(/(\d{1,3})$/)[1];
    return `reels_${num.padStart(2, '0')}`;
  }
  return normalize(raw);
}

// Sahifa ochilganda bir marta chaqiriladi. Manbani saqlaydi (agar hali
// yo'q bo'lsa) va serverga yuborish uchun qaytaradi.
export function captureSource({ search, startParam } = {}) {
  const stored = readStored();
  const incoming =
    sourceFromStartParam(startParam)
    || sourceFromSearch(search !== undefined ? search : typeof window !== 'undefined' ? window.location.search : '');
  if (!stored && incoming) {
    store(incoming);
    return incoming;
  }
  return stored;
}

export function getSource() {
  return readStored();
}

// Botga o'tish havolasi — manba bilan.
// Reels kodi o'zi deep-link payload'i bo'la oladi (?start=reels_07), qolgani
// `src_` prefiksi bilan ketadi, aks holda bot uni referal yoki ichki buyruq
// deb o'qib qolishi mumkin.
export function botLinkWithSource(botUsername, source = getSource()) {
  const bot = String(botUsername || '').replace(/^@/, '');
  const base = `https://t.me/${bot}`;
  const slug = normalize(source);
  if (!slug) return base;
  const payload = /^reels_\d+$/.test(slug) ? slug : `src_${slug}`;
  return `${base}?start=${payload}`;
}
