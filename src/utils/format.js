// Formatlash yordamchilari.

// Narxni "45 000 UZS" ko'rinishida formatlaydi.
export function formatPrice(amount, currency = 'UZS') {
  const value = Number(amount || 0);
  const formatted = new Intl.NumberFormat('ru-RU').format(Math.round(value));
  return currency ? `${formatted} ${currency}` : formatted;
}

// Faqat raqamni formatlaydi (valyutasiz).
export function formatNumber(amount) {
  return new Intl.NumberFormat('ru-RU').format(Number(amount || 0));
}

// Chegirma foizini hisoblaydi (eski narxdan yangi narxga).
export function discountPercent(oldPrice, newPrice) {
  const o = Number(oldPrice || 0);
  const n = Number(newPrice || 0);
  if (!o || o <= n) return 0;
  return Math.round(((o - n) / o) * 100);
}

// Sanani lokalga mos ko'rsatadi.
export function formatDate(value, locale = 'uz-UZ') {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Necha kun qolganini hisoblaydi (musbat = kelajak).
export function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / (24 * 60 * 60 * 1000));
}
