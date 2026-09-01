import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createTranslator, normalizeLang, DEFAULT_LANG } from './index.js';
import { getStoredLang, setStoredLang } from '../utils/storage.js';

const I18nContext = createContext(null);

// Boshlang'ich tilni aniqlaydi: saqlangan til → Telegram tili → default.
function detectInitialLang() {
  const stored = getStoredLang();
  if (stored) return normalizeLang(stored);
  try {
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (tgLang) return normalizeLang(tgLang);
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG;
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang);
  // Foydalanuvchi tilni o'zi tanlaganmi? detectInitialLang() Telegram tilini
  // yoki default'ni ham qaytaradi, shuning uchun "til bor" bilan "til
  // tanlangan" bir xil emas: ilova birinchi ochilganda til so'rash uchun
  // aynan shu farq kerak.
  const [langChosen, setLangChosen] = useState(() => Boolean(getStoredLang()));

  const setLang = (next) => {
    const normalized = normalizeLang(next);
    setLangState(normalized);
    setStoredLang(normalized);
    setLangChosen(true);
  };

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const value = useMemo(
    () => ({ lang, langChosen, setLang, t: createTranslator(lang) }),
    [lang, langChosen],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
