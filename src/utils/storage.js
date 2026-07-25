// LocalStorage yordamchi funksiyalari.
// Barcha kalitlar bitta префикс ostida saqlanadi, JSON bilan (de)serialize qilinadi.

const PREFIX = 'santyx:';

export const KEYS = {
  LANG: 'lang',
  ONBOARDED: 'onboarded',
  CONTACT_SAVED: 'contactSaved',
  CART: 'cart',
  RECENT: 'recentlyViewed',
  WISHLIST: 'wishlist',
};

function safeParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function readStorage(key, fallback = null) {
  try {
    return safeParse(localStorage.getItem(PREFIX + key), fallback);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/* ---- Til ---- */
export function getStoredLang() {
  return readStorage(KEYS.LANG, null);
}
export function setStoredLang(lang) {
  writeStorage(KEYS.LANG, lang);
}

/* ---- Onboarding ---- */
export function isOnboarded() {
  return readStorage(KEYS.ONBOARDED, false) === true;
}
export function setOnboarded() {
  writeStorage(KEYS.ONBOARDED, true);
}

/* ---- Kontakt (telefon) saqlangan-yo'qligi ---- */
export function isContactSaved() {
  return readStorage(KEYS.CONTACT_SAVED, false) === true;
}
export function setContactSaved(v = true) {
  writeStorage(KEYS.CONTACT_SAVED, v);
}

/* ---- Savat (offline nusxa) ---- */
export function getCart() {
  const cart = readStorage(KEYS.CART, []);
  return Array.isArray(cart) ? cart : [];
}
export function setCart(items) {
  writeStorage(KEYS.CART, Array.isArray(items) ? items : []);
}

/* ---- Oxirgi ko'rilganlar ---- */
const RECENT_LIMIT = 20;
export function getRecentlyViewed() {
  const list = readStorage(KEYS.RECENT, []);
  return Array.isArray(list) ? list : [];
}
export function pushRecentlyViewed(productId) {
  if (!productId) return;
  const list = getRecentlyViewed().filter((id) => id !== productId);
  list.unshift(productId);
  writeStorage(KEYS.RECENT, list.slice(0, RECENT_LIMIT));
}

/* ---- Wishlist (offline nusxa) ---- */
export function getWishlist() {
  const list = readStorage(KEYS.WISHLIST, []);
  return Array.isArray(list) ? list : [];
}
export function setWishlist(list) {
  writeStorage(KEYS.WISHLIST, Array.isArray(list) ? list : []);
}
export function toggleWishlist(productId) {
  const list = getWishlist();
  const next = list.includes(productId)
    ? list.filter((id) => id !== productId)
    : [...list, productId];
  setWishlist(next);
  return next;
}
