import Icon from './Icon.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './RatingStars.module.css';

// Yulduzli reyting — ko'rsatish yoki interaktiv kiritish rejimida.
export default function RatingStars({
  value = 0,
  size = 16,
  interactive = false,
  onChange,
  count,
  showValue = false,
}) {
  const rounded = Math.round(value);
  const stars = [1, 2, 3, 4, 5];

  const handleClick = (star) => {
    if (!interactive) return;
    haptic.selection();
    onChange?.(star);
  };

  return (
    <span className={styles.wrap}>
      <span className={styles.stars}>
        {stars.map((star) => {
          const filled = interactive ? star <= value : star <= rounded;
          const Star = (
            <Icon name="star" size={size} filled={filled} strokeWidth={1.6} />
          );
          return interactive ? (
            <button
              key={star}
              type="button"
              className={`${styles.star} ${filled ? styles.on : styles.off}`}
              onClick={() => handleClick(star)}
              aria-label={`${star}`}
            >
              {Star}
            </button>
          ) : (
            <span key={star} className={`${styles.star} ${filled ? styles.on : styles.off}`}>
              {Star}
            </span>
          );
        })}
      </span>
      {showValue && value > 0 && <span className={styles.value}>{value.toFixed(1)}</span>}
      {count != null && count > 0 && <span className={styles.count}>({count})</span>}
    </span>
  );
}
