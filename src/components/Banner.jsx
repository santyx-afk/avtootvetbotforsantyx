import { openLink, openTelegramLink, haptic } from '../telegram/webapp.js';
import styles from './Banner.module.css';

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
          onClick={() => openBannerLink(b.link)}
          disabled={!b.link}
        >
          <img src={b.image_url} alt={b.title || ''} loading="lazy" />
        </button>
      ))}
    </div>
  );
}
