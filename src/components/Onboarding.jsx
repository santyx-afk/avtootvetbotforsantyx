import { useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './Onboarding.module.css';

const EMOJIS = ['👋', '🗂️', '🛒', '💳', '🎁'];

// Onboarding slaydlari — faqat birinchi marta ko'rsatiladi.
// Swipe (scroll-snap) + dots + skip/next tugmalari.
export default function Onboarding({ onDone }) {
  const { t } = useI18n();
  const slides = t('onboarding.slides');
  const list = Array.isArray(slides) ? slides : [];
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const isLast = index >= list.length - 1;

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) {
      setIndex(i);
      haptic.selection();
    }
  };

  const goNext = () => {
    haptic.impact('light');
    if (isLast) {
      onDone?.();
      return;
    }
    const el = trackRef.current;
    el?.scrollTo({ left: (index + 1) * el.clientWidth, behavior: 'smooth' });
  };

  const skip = () => {
    haptic.impact('light');
    onDone?.();
  };

  return (
    <div className={styles.overlay}>
      <button type="button" className={styles.skip} onClick={skip}>
        {t('onboarding.skip')}
      </button>

      <div className={styles.track} ref={trackRef} onScroll={onScroll}>
        {list.map((slide, i) => (
          <div className={styles.slide} key={i}>
            <div className={styles.emoji}>{EMOJIS[i % EMOJIS.length]}</div>
            <h2 className={styles.title}>{slide.title}</h2>
            <p className={styles.text}>{slide.text}</p>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.dots}>
          {list.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === index ? styles.dotActive : ''}`} />
          ))}
        </div>
        <button type="button" className={`${styles.cta} pressable`} onClick={goNext}>
          {isLast ? t('onboarding.start') : t('onboarding.next')}
        </button>
      </div>
    </div>
  );
}
