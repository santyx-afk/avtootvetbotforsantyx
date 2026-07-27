import { openLink, openTelegramLink, haptic } from '../telegram/webapp.js';
import styles from './Banner.module.css';

// Gradient kiritilmagan banner uchun default fon
const DEFAULT_GRADIENT = 'linear-gradient(135deg, #667eea, #764ba2)';

function openBannerLink(link) {
  if (!link) return;
  haptic.impact('light');
  if (link.includes('t.me') || link.startsWith('tg://')) openTelegramLink(link);
  else openLink(link);
}

// Admin boshqaradigan bannerlar (gorizontal karusel). Bo'sh bo'lsa hech narsa ko'rsatmaydi.
export default function Banner({ banners = [] }) {
  if (!banners.length) return null;
  return (
    <div className={styles.track}>
      {banners.map((b) => (
        <button
          key={b.id}
          type="button"
          className={styles.slide}
          style={b.image_url ? undefined : { background: b.gradient || DEFAULT_GRADIENT }}
          onClick={() => openBannerLink(b.link)}
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
