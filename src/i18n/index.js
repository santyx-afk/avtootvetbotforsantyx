import uz from './translations/uz.js';
import ru from './translations/ru.js';
import en from './translations/en.js';

export const DICTS = { uz, ru, en };
export const SUPPORTED_LANGS = ['uz', 'ru', 'en'];
export const DEFAULT_LANG = 'uz';

// Telegram/brauzer til kodini qo'llab-quvvatlanadigan tilga moslaydi.
export function normalizeLang(code) {
  const c = String(code || '').toLowerCase().slice(0, 2);
  return SUPPORTED_LANGS.includes(c) ? c : DEFAULT_LANG;
}

// Nuqta bilan ajratilgan yo'l bo'yicha (masalan "pages.cart.title") qiymatni oladi.
function resolvePath(obj, path) {
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

// {var} shablonlarini almashtiradi.
function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
}

// Berilgan til uchun t() funksiyasini yaratadi. Topilmasa DEFAULT_LANG ga,
// keyin kalitning o'ziga qaytadi. Massivlar (masalan slides) qo'llab-quvvatlanadi.
export function createTranslator(lang) {
  const dict = DICTS[lang] || DICTS[DEFAULT_LANG];
  return function t(path, vars) {
    let value = resolvePath(dict, path);
    if (value === undefined) value = resolvePath(DICTS[DEFAULT_LANG], path);
    if (value === undefined) return path;
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return value;
    return interpolate(value, vars);
  };
}
