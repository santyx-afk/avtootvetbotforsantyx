import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import RatingStars from './RatingStars.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { formatPrice, discountPercent } from '../utils/format.js';
import { haptic } from '../telegram/webapp.js';
import styles from './ProductCard.module.css';

// Rasmsiz mahsulot uchun rangli fallback (nom bosh harfi).
function Placeholder({ name }) {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  const hue = ([...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
  return (
    <div className={styles.placeholder} style={{ background: `hsl(${hue} 60% 55%)` }}>
      {letter}
    </div>
  );
}

export default function ProductCard({ product, inWishlist, onToggleWishlist, onAddToCart }) {
  const { t } = useI18n();
  const [added, setAdded] = useState(false);
  const off = discountPercent(product.old_price, product.price);

  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleWishlist = (e) => {
    stop(e);
    haptic.impact('light');
    onToggleWishlist?.(product);
  };

  const handleAdd = (e) => {
    stop(e);
    haptic.impact('medium');
    onAddToCart?.(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <Link to={`/catalog/${product.id}`} className={styles.card}>
      <div className={styles.imageWrap}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy" />
        ) : (
          <Placeholder name={product.name} />
        )}

        <div className={styles.badges}>
          {product.is_popular && <span className={styles.popular}>🔥 {t('catalog.popular')}</span>}
          {off > 0 && <span className={styles.discount}>-{off}%</span>}
        </div>

        <button
          type="button"
          className={`${styles.heart} ${inWishlist ? styles.heartOn : ''}`}
          onClick={handleWishlist}
          aria-label="wishlist"
        >
          <Icon name="wishlist" size={19} filled={inWishlist} strokeWidth={2} />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.name}>{product.name}</div>
        {product.rating?.count > 0 && (
          <RatingStars value={product.rating.avg} count={product.rating.count} size={13} />
        )}
        <div className={styles.priceRow}>
          <div className={styles.prices}>
            <span className={styles.price}>{formatPrice(product.price, product.currency)}</span>
            {off > 0 && <span className={styles.oldPrice}>{formatPrice(product.old_price)}</span>}
          </div>
        </div>
        <button
          type="button"
          className={`${styles.addBtn} ${added ? styles.addBtnDone : ''}`}
          onClick={handleAdd}
        >
          <Icon name={added ? 'check' : 'cart'} size={16} strokeWidth={2} />
          {added ? t('catalog.added') : t('catalog.addToCart')}
        </button>
      </div>
    </Link>
  );
}
