// window.Telegram.WebApp ustidan yupqa, xavfsiz qoplama.
// Telegram tashqarisida (oddiy brauzer) barcha metodlar no-op bo'ladi,
// shunda ilova rivojlanish paytida ham ishlayveradi.

export function getWebApp() {
  try {
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

export function isTelegram() {
  const wa = getWebApp();
  // initData bo'sh bo'lsa — bu haqiqiy Telegram muhiti emas (yoki test)
  return Boolean(wa && wa.initData);
}

// Ilovani ishga tushiradi: ready + expand + swipe'larni cheklash.
export function initWebApp() {
  const wa = getWebApp();
  if (!wa) return null;
  try {
    wa.ready();
    wa.expand?.();
    // Yopilishdan oldin tasdiq (tasodifiy swipe-down ni oldini oladi)
    wa.enableClosingConfirmation?.();
    // Vertikal swipe bilan yopilishni o'chirish (yangi versiyalarda)
    wa.disableVerticalSwipes?.();
  } catch {
    /* ignore */
  }
  return wa;
}

// Telegram tema parametrlarini CSS o'zgaruvchilariga (--tg-theme-*) yozadi.
export function applyThemeVars(wa) {
  const root = document.documentElement;
  const params = wa?.themeParams || {};
  const keys = Object.keys(params);
  if (keys.length) {
    root.setAttribute('data-tg-theme', '1');
    keys.forEach((key) => {
      const value = params[key];
      if (value) root.style.setProperty(`--tg-theme-${key.replace(/_/g, '-')}`, value);
    });
  }
  // data-theme faqat HAQIQIY Telegram ichida (initData bor) Telegram
  // sxemasidan o'rnatiladi. SDK skripti oddiy brauzerda ham yuklanadi va
  // colorScheme'ni doim 'light' deb beradi — usiz saytdagi doimiy dark
  // rejim (index.html'dagi data-theme="dark") ustidan yozilib ketardi.
  if (wa?.colorScheme && wa?.initData) root.setAttribute('data-theme', wa.colorScheme);

  // Header/background rangini sahifa foniga moslash
  try {
    const bg = params.secondary_bg_color || params.bg_color;
    if (wa?.setHeaderColor && params.bg_color) wa.setHeaderColor(params.bg_color);
    if (wa?.setBackgroundColor && bg) wa.setBackgroundColor(bg);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && params.bg_color) meta.setAttribute('content', params.bg_color);
  } catch {
    /* ignore */
  }
}

/* ---------------- Haptik javob ---------------- */
export const haptic = {
  impact(style = 'light') {
    try {
      getWebApp()?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* ignore */
    }
  },
  notification(type = 'success') {
    try {
      getWebApp()?.HapticFeedback?.notificationOccurred(type);
    } catch {
      /* ignore */
    }
  },
  selection() {
    try {
      getWebApp()?.HapticFeedback?.selectionChanged();
    } catch {
      /* ignore */
    }
  },
};

/* ---------------- Back button ---------------- */
let backHandler = null;
export function showBackButton(handler) {
  const wa = getWebApp();
  if (!wa?.BackButton) return;
  if (backHandler) wa.BackButton.offClick(backHandler);
  backHandler = handler;
  wa.BackButton.onClick(handler);
  wa.BackButton.show();
}
export function hideBackButton() {
  const wa = getWebApp();
  if (!wa?.BackButton) return;
  if (backHandler) wa.BackButton.offClick(backHandler);
  backHandler = null;
  wa.BackButton.hide();
}

/* ---------------- Havolalar ---------------- */
export function openTelegramLink(url) {
  const wa = getWebApp();
  if (wa?.openTelegramLink) wa.openTelegramLink(url);
  else window.open(url, '_blank');
}
export function openLink(url) {
  const wa = getWebApp();
  if (wa?.openLink) wa.openLink(url);
  else window.open(url, '_blank');
}

// Universal ulashish: Telegram'da t.me/share, brauzerda navigator.share yoki clipboard.
export async function shareUrl(url, text = '') {
  const wa = getWebApp();
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    );
    return { ok: true, via: 'telegram' };
  }
  try {
    if (navigator.share) {
      await navigator.share({ url, text });
      return { ok: true, via: 'native' };
    }
  } catch {
    /* foydalanuvchi bekor qildi yoki qo'llab-quvvatlanmaydi */
  }
  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, via: 'clipboard' };
  } catch {
    window.open(url, '_blank');
    return { ok: true, via: 'window' };
  }
}

/* ---------------- Kontakt (telefon) so'rash ---------------- */
// Telegram requestContact ni Promise ga o'raydi.
export function requestContact() {
  return new Promise((resolve) => {
    const wa = getWebApp();
    if (!wa?.requestContact) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    try {
      wa.requestContact((granted, payload) => {
        resolve({ ok: Boolean(granted), payload });
      });
    } catch {
      resolve({ ok: false, reason: 'error' });
    }
  });
}
