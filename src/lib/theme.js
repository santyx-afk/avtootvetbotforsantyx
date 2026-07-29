// Brauzer uchun dark/light tema boshqaruvi (Telegram tashqarisida).
// Telegram ichida tema TelegramProvider orqali keladi — bu modul faqat brauzerda ta'sir qiladi
// (global.css'dagi :root[data-theme=...]:not([data-tg-theme]) qoidalari orqali).

const KEY = 'santyx:theme';

export function getTheme() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    /* ignore */
  }
  return 'light';
}

export function applyTheme(theme) {
  try {
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    /* ignore */
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

// Ilova yuklanganda saqlangan (yoki tizim) temani qo'llaydi.
export function initTheme() {
  applyTheme(getTheme());
}
