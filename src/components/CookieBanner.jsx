import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { isTelegram } from '../telegram/webapp.js';
import { isCookieNoticeAccepted, acceptCookieNotice } from '../utils/storage.js';
import styles from './CookieBanner.module.css';

// Brauzerdagi cookie/localStorage bildirishnomasi.
//
// Sayt uchinchi tomon kuzatuv (analytics, reklama) kodlarini ishlatmaydi —
// saqlanadigan hamma narsa saytning ishlashi uchun zarur (JWT, til, savat).
// Shuning uchun bu "rozilik so'rovi" emas, balki bildirishnoma: bitta tugma
// ("Tushunarli") va siyosatga havola. Kelajakda ixtiyoriy kuzatuv qo'shilsa,
// bu yerga "Rad etish" tugmasi ham qo'shilishi kerak bo'ladi.
//
// Telegram Mini App ichida ko'rsatilmaydi: u yerda brauzer sessiyasi ham,
// cookie ham yo'q, ekran esa tor.
export default function CookieBanner() {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => isTelegram() || isCookieNoticeAccepted());
  const ref = useRef(null);

  // Bildirishnoma balandligini `--cookie-banner-h` ga yozamiz — sahifa pastidagi
  // kontent (landing footer havolalari, siyosat matni) uning ostida qolib
  // ketmasin. Matn tarjimaga qarab turlicha o'ralgani uchun balandlik qattiq
  // qiymat emas, o'lchanadi.
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (hidden || !el) {
      root.style.removeProperty('--cookie-banner-h');
      return undefined;
    }
    const apply = () => root.style.setProperty('--cookie-banner-h', `${el.offsetHeight}px`);
    apply();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply);
      return () => {
        window.removeEventListener('resize', apply);
        root.style.removeProperty('--cookie-banner-h');
      };
    }
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--cookie-banner-h');
    };
  }, [hidden]);

  if (hidden) return null;

  const accept = () => {
    acceptCookieNotice();
    setHidden(true);
  };

  return (
    <div className={styles.banner} ref={ref} role="region" aria-label={t('cookies.more')}>
      <div className={styles.inner}>
        <p className={styles.text}>{t('cookies.text')}</p>
        <div className={styles.actions}>
          <Link className={styles.link} to="/maxfiylik">
            {t('cookies.more')}
          </Link>
          <button type="button" className={styles.accept} onClick={accept}>
            {t('cookies.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
