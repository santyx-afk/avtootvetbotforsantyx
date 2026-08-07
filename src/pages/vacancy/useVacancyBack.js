import { useEffect, useRef } from 'react';
import { showBackButton, hideBackButton } from '../../telegram/webapp.js';

// Chat va order tafsilotlari alohida route emas — ular tab ichidagi ko'rinish.
// Shu sabab Telegram "orqaga" tugmasi ularni yopmaydi (BackButtonManager
// vakansiya tablarini ildiz deb biladi). Bu hook ochilgan ichki ko'rinish
// uchun tugmani vaqtincha o'ziga oladi va yopilganda qaytarib beradi.
//
// Handler ref'da saqlanadi — har renderda yangi funksiya kelsa ham tugma
// qayta ro'yxatdan o'tkazilmaydi.
//
// MUHIM: tugmani bir vaqtda faqat BITTA komponent boshqarsin. Ichma-ich
// ko'rinishlarda (chat ichida ochilgan order) tashqi komponent ikkala holatni
// ham o'z handleri ichida hal qiladi — aks holda ichkisi yopilganda tugma
// butunlay yo'qolib, tashqi ko'rinish tugmasiz qolardi.
export function useVacancyBack(onBack, active = true) {
  const handlerRef = useRef(onBack);
  handlerRef.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    showBackButton(() => handlerRef.current?.());
    return () => hideBackButton();
  }, [active]);
}
