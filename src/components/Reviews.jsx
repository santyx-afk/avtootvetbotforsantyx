import { useState } from 'react';
import RatingStars from './RatingStars.jsx';
import Spinner from './Spinner.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { haptic } from '../telegram/webapp.js';
import { formatDate } from '../utils/format.js';
import styles from './Reviews.module.css';

export default function Reviews({ productId, reviews: initial = [] }) {
  const { t, lang } = useI18n();
  const [reviews, setReviews] = useState(initial);
  const [formRating, setFormRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const localeMap = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };

  const submit = async () => {
    if (!formRating || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiCall('add-review', { productId, rating: formRating, text: text.trim() });
      if (res?.review) {
        setReviews((prev) => [res.review, ...prev.filter((r) => r.id !== res.review.id)]);
      }
      setDone(true);
      haptic.notification('success');
    } catch {
      haptic.notification('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}>{t('product.reviews')}</h2>

      {/* Sharh yozish formasi */}
      {done ? (
        <div className={styles.thanks}>🎉 {t('product.reviewThanks')}</div>
      ) : (
        <div className={styles.form}>
          <div className={styles.formTop}>
            <span className={styles.formLabel}>{t('product.yourRating')}</span>
            <RatingStars value={formRating} interactive size={26} onChange={setFormRating} />
          </div>
          <textarea
            className={styles.textarea}
            placeholder={t('product.reviewPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
          />
          <button
            type="button"
            className={`${styles.submit} pressable`}
            onClick={submit}
            disabled={!formRating || submitting}
          >
            {submitting ? <Spinner size={16} stroke={2} /> : t('product.submitReview')}
          </button>
        </div>
      )}

      {/* Sharhlar ro'yxati */}
      {reviews.length === 0 ? (
        <p className={styles.empty}>{t('product.noReviews')}</p>
      ) : (
        <ul className={styles.list}>
          {reviews.map((r) => (
            <li key={r.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.author}>{r.user_name || '—'}</span>
                <span className={styles.date}>{formatDate(r.created_at, localeMap[lang])}</span>
              </div>
              <RatingStars value={r.rating} size={14} />
              {r.text ? <p className={styles.text}>{r.text}</p> : null}
              {r.admin_reply ? (
                <div className={styles.reply}>
                  <span className={styles.replyLabel}>{t('product.adminReply')}</span>
                  <p>{r.admin_reply}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
