import { useEffect } from 'react';
import { showBackButton, hideBackButton } from '../telegram/webapp.js';

// Modal oynalar uchun umumiy xatti-harakat:
//  - fon aylanmaydi (body scroll lock);
//  - Escape oynani yopadi;
//  - Telegram'ning "ortga" tugmasi ilovadan chiqib ketmasdan oynani yopadi.
//
// `onDismiss` berilmasa (masalan majburiy qoidalar oynasi) — faqat scroll lock
// qo'llanadi, oynani yopib bo'lmaydi.
//
// MUHIM: `onDismiss` barqaror bo'lsin (useCallback) — aks holda har renderda
// hodisalar qayta bog'lanadi.
export default function useModalDismiss(onDismiss) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (!onDismiss) {
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    showBackButton(onDismiss);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      hideBackButton();
    };
  }, [onDismiss]);
}
