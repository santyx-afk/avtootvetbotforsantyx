import { useState } from 'react';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { haptic } from '../telegram/webapp.js';
import styles from './ReviewModal.module.css';

// Interaktiv 5-yulduz komponenti. Props: rating, onRate, size, disabled.
// Katta, tap-friendly (44px), bosilganda scale animatsiya + haptik.
export function StarRating({ rating = 0, onRate, size = 38, disabled = false }) {
  return (
    <div className={styles.stars}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          className={`${styles.star} ${star <= rating ? styles.on : styles.off}`}
          onClick={() => {
            if (disabled) return;
            haptic.selection();
            onRate?.(star);
          }}
          aria-label={`${star}`}
        >
          <Icon name="star" size={size} filled={star <= rating} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

// Xariddan keyin sharh qoldirish modali.
// OLIB TASHLASH: Checkout.jsx dagi import + showReview state/effect + <ReviewModal/>
// render'ini, hamda bu fayl (+ .module.css) va i18n review.* kalitlarini o'chiring.
export default function ReviewModal({ planId, orderId, onClose }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | success

  const submit = async () => {
    if (!rating || status === 'sending') return;
    haptic.impact('medium');
    setStatus('sending');
    try {
      await apiCall('add-review', {
        productId: planId,
        orderId,
        rating,
        text: text.trim().slice(0, 500),
      });
      setStatus('success');
      haptic.notification('success');
      setTimeout(() => onClose?.(), 2000);
    } catch {
      // Xatoda modalni bloklamaymiz — foydalanuvchi qayta urinishi mumkin
      setStatus('idle');
      haptic.notification('error');
    }
  };

  return (
    // Overlay bosilganda YOPILMAYDI — faqat tugmalar orqali
    <div className={styles.overlay}>
      <div className={styles.card}>
        {status === 'success' ? (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>⭐</div>
            <p className={styles.successText}>{t('review.success')}</p>
          </div>
        ) : (
          <>
            <h2 className={styles.title}>{t('review.title')}</h2>
            <p className={styles.subtitle}>{t('review.subtitle')}</p>

            <StarRating rating={rating} onRate={setRating} disabled={status === 'sending'} />
            {!rating && <p className={styles.hint}>{t('review.selectRating')}</p>}

            <textarea
              className={styles.textarea}
              placeholder={t('review.placeholder')}
              value={text}
              maxLength={500}
              rows={3}
              onChange={(e) => setText(e.target.value)}
              disabled={status === 'sending'}
            />

            <button
              type="button"
              className={styles.submit}
              onClick={submit}
              disabled={!rating || status === 'sending'}
            >
              {status === 'sending' ? <Spinner size={18} stroke={2} /> : t('review.submit')}
            </button>

            <button type="button" className={styles.later} onClick={() => onClose?.()}>
              {t('review.later')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
