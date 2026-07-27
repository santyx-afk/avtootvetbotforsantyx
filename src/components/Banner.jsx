import { useNavigate } from 'react-router-dom';
import { openLink, openTelegramLink, haptic } from '../telegram/webapp.js';
import styles from './Banner.module.css';

// Gradient kiritilmagan banner uchun default fon
const DEFAULT_GRADIENT = 'linear-gradient(135deg, #667eea, #764ba2)';

// Ichki action nomlarini Mini App ichidagi sahifalarga bog'laydi.
const INTERNAL_ROUTES = {
  catalog: '/catalog',
  cart: '/cart',
  wishlist: '/wishlist',
  history: '/history',
  profile: '/profile',
  topup: '/profile/topup',
};

// Banner havolasini ochadi. Hech qachon tashqi brauzerga chiqmaydi:
//  - ichki action (topup, catalog, profile, wishlist, history...) → Mini App ichida navigatsiya
//  - t.me / tg:// havola → Telegram ichida ochiladi
//  - http(s) URL → Telegram.WebApp.openLink() (Telegram ichki brauzeri)
//  - aks holda plan_id deb qabul qilinadi → mahsulot sahifasiga o'tadi
function openBannerLink(link, navigate) {
  if (!link) return;
  haptic.impact('light');
  const raw = String(link).trim();
  const lower = raw.toLowerCase();
  if (lower.includes('t.me') || lower.startsWith('tg://')) {
    openTelegramLink(raw);
    return;
  }
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    openLink(raw);
    return;
  }
  const key = lower.replace(/^\/+/, '');
  if (INTERNAL_ROUTES[key]) {
    navigate(INTERNAL_ROUTES[key]);
    return;
  }
  // Boshqa holatda havola plan_id (mahsulot) deb qaraladi.
  navigate(`/catalog/${raw}`);
}

// Admin boshqaradigan bannerlar (gorizontal karusel). Bo'sh bo'lsa hech narsa ko'rsatmaydi.
export default function Banner({ banners = [] }) {
  const navigate = useNavigate();
  if (!banners.length) return null;
  return (
    <div className={styles.track}>
      {banners.map((b) => (
        <button
          key={b.id}
          type="button"
          className={styles.slide}
          style={b.image_url ? undefined : { background: b.gradient || DEFAULT_GRADIENT }}
          onClick={() => openBannerLink(b.link, navigate)}
          disabled={!b.link}
        >
          {b.image_url ? (
            <img src={b.image_url} alt={b.title || ''} loading="lazy" />
          ) : (
            <div className={styles.content}>
              {b.title ? <span className={styles.title}>{b.title}</span> : null}
              {b.subtitle ? <span className={styles.subtitle}>{b.subtitle}</span> : null}
              {b.btn_text ? <span className={styles.btn}>{b.btn_text}</span> : null}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
