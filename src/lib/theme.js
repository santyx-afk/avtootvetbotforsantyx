// Sayt faqat tungi (dark) rejimda ishlaydi — yorug'/tungi almashtirgich
// olib tashlangan. data-theme="dark" index.html'da statik turadi; bu funksiya
// SPA navigatsiyasida ham atribut joyida bo'lishini kafolatlaydi.
// Telegram ichida temani TelegramProvider (applyThemeVars) Telegram
// sxemasidan boshqaradi — u bu qiymatni ustidan yozishi mumkin.
export function initTheme() {
  try {
    document.documentElement.setAttribute('data-theme', 'dark');
  } catch {
    /* ignore */
  }
}
