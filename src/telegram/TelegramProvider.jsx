import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getWebApp,
  initWebApp,
  applyThemeVars,
  isTelegram,
  haptic,
  showBackButton,
  hideBackButton,
  openTelegramLink,
  openLink,
  requestContact,
} from './webapp.js';

const TelegramContext = createContext(null);

export function TelegramProvider({ children }) {
  const [webApp, setWebApp] = useState(null);
  const [colorScheme, setColorScheme] = useState('light');

  useEffect(() => {
    const wa = initWebApp();
    setWebApp(wa);
    applyThemeVars(wa);
    if (wa) setColorScheme(wa.colorScheme || 'light');

    // Tema o'zgarganda CSS o'zgaruvchilarini yangilash
    const onThemeChanged = () => {
      applyThemeVars(wa);
      setColorScheme(wa?.colorScheme || 'light');
    };
    wa?.onEvent?.('themeChanged', onThemeChanged);

    return () => {
      wa?.offEvent?.('themeChanged', onThemeChanged);
    };
  }, []);

  const value = useMemo(() => {
    const wa = webApp || getWebApp();
    const user = wa?.initDataUnsafe?.user || null;
    return {
      webApp: wa,
      isTelegram: isTelegram(),
      colorScheme,
      user,
      // Backend validatsiyasi uchun xom initData satri
      initData: wa?.initData || '',
      startParam: wa?.initDataUnsafe?.start_param || null,
      haptic,
      showBackButton,
      hideBackButton,
      openTelegramLink,
      openLink,
      requestContact,
      close: () => wa?.close?.(),
      expand: () => wa?.expand?.(),
    };
  }, [webApp, colorScheme]);

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  const ctx = useContext(TelegramContext);
  if (!ctx) throw new Error('useTelegram must be used within TelegramProvider');
  return ctx;
}
