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

  const setLang = (next) => {
    const normalized = normalizeLang(next);
    setLangState(normalized);
    setStoredLang(normalized);
  };

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t: createTranslator(lang) }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
