import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import RatingStars from '../components/RatingStars.jsx';
import Reviews from '../components/Reviews.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Spinner from '../components/Spinner.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { useProductActions } from '../hooks/useProductActions.js';
import { pushRecentlyViewed } from '../utils/storage.js';
import { openTelegramLink, haptic } from '../telegram/webapp.js';
import { formatPrice, discountPercent } from '../utils/format.js';
import styles from './ProductDetail.module.css';

const BOT = import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot';

function Placeholder({ name }) {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  const hue = ([...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
  return (
    <div className={styles.placeholder} style={{ background: `hsl(${hue} 60% 55%)` }}>
      {letter}
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toggleWishlist, addToCart } = useProductActions();

  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [wish, setWish] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  // Savatga qo'shilgandan keyin "Savatga o'tish" tugmasi paydo bo'ladi va
  // sahifada qoladi (added esa 1.6 soniyalik "Qo'shildi" javobi uchun).
  const [inCart, setInCart] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await apiCall('product', { productId: id });
      setData(res);
      setWish(Boolean(res.in_wishlist));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    load();
    pushRecentlyViewed(id);
    // Boshqa mahsulotga o'tilganda tugma yana yashirinadi: u aynan shu
    // sahifada qo'shilgandan keyin chiqishi kerak.
    setInCart(false);
  }, [load, id]);

  const product = data?.product;

  const doShare = () => {
    haptic.impact('light');
    const url = `https://t.me/${BOT}`;
    openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(product?.name || '')}`,
    );
  };

  const doWishlist = async () => {
    haptic.impact('light');
    const prev = wish;
    setWish(!prev);
    try {
      const now = await toggleWishlist(id);
      setWish(now);
    } catch {
      setWish(prev);
    }
  };

  const doAddToCart = async () => {
    if (adding || !product?.in_stock) return;
    setAdding(true);
    try {
      await addToCart(id, qty);
      setAdded(true);
      setInCart(true);
      setTimeout(() => setAdded(false), 1600);
    } catch {
      haptic.notification('error');
    } finally {
      setAdding(false);
    }
  };

  const goToCart = () => {
    haptic.impact('light');
    navigate('/cart');
  };

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <Skeleton height={260} radius={0} />
        <div className={styles.body}>
          <Skeleton height={22} width="70%" />
          <Skeleton height={16} width="40%" />
          <Skeleton height={30} width="50%" />
          <Skeleton height={80} width="100%" />
        </div>
      </div>
    );
  }

  if (status === 'error' || !product) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.floatBack} onClick={() => navigate(-1)}>
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <ErrorState onRetry={load} />
      </div>
    );
  }

  const off = discountPercent(product.old_price, product.price);
  const savings = off > 0 ? Number(product.old_price) - Number(product.price) : 0;

  return (
    <div className={`${styles.page} ${inCart ? styles.pageWithCart : ''}`}>
      {/* Hero rasm */}
      <div className={styles.hero}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} />
        ) : (
          <Placeholder name={product.name} />
        )}
        <button type="button" className={styles.floatBack} onClick={() => navigate(-1)}>
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <button type="button" className={styles.floatShare} onClick={doShare}>
          <Icon name="share" size={20} strokeWidth={2} />
        </button>
        {product.is_popular && <span className={styles.popular}>🔥 {t('catalog.popular')}</span>}
      </div>

      <div className={styles.body}>
        <h1 className={styles.name}>{product.name}</h1>

        {product.rating?.count > 0 && (
          <RatingStars value={product.rating.avg} count={product.rating.count} size={16} showValue />
        )}

        {/* Narx bloki */}
        <div className={styles.priceBlock}>
          <div className={styles.priceRow}>
            <span className={styles.price}>{formatPrice(product.price, product.currency)}</span>
            {off > 0 && <span className={styles.discountBadge}>-{off}%</span>}
          </div>
          {off > 0 && (
            <div className={styles.savings}>
              <span className={styles.official}>
                {t('product.official')}: <s>{formatPrice(product.old_price, product.currency)}</s>
              </span>
              <span className={styles.saveTag}>
                {t('product.youSave')} {formatPrice(savings, product.currency)}
              </span>
            </div>
          )}
        </div>

        {/* Muddat */}
        {product.duration ? (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>{t('product.duration')}</span>
            <span className={styles.metaValue}>{product.duration}</span>
          </div>
        ) : null}

        {/* Tavsif */}
        {product.description ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('product.description')}</h2>
            <p className={styles.paragraph}>{product.description}</p>
          </section>
        ) : null}

        {/* Qoidalar */}
        {(product.rules_text || data.general_terms) ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('product.rules')}</h2>
            {product.rules_text ? <p className={styles.paragraph}>{product.rules_text}</p> : null}
            {data.general_terms ? (
              <p className={`${styles.paragraph} ${styles.generalTerms}`}>{data.general_terms}</p>
            ) : null}
          </section>
        ) : null}

        {/* Sharhlar */}
        <Reviews productId={id} reviews={data.reviews || []} />
      </div>

      {/* Sticky pastki panel */}
      <div className={styles.actionBar}>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={`${styles.wishBtn} ${wish ? styles.wishOn : ''}`}
            onClick={doWishlist}
            aria-label="wishlist"
          >
            <Icon name="wishlist" size={22} filled={wish} strokeWidth={2} />
          </button>

          {product.in_stock && (
            <div className={styles.stepper}>
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setQty((q) => Math.max(1, q - 1));
                }}
                disabled={qty <= 1}
              >
                <Icon name="minus" size={18} strokeWidth={2.4} />
              </button>
              <span>{qty}</span>
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setQty((q) => Math.min(5, q + 1));
                }}
                disabled={qty >= 5}
              >
                <Icon name="plus" size={18} strokeWidth={2.4} />
              </button>
            </div>
          )}

          <button
            type="button"
            className={`${styles.addBtn} ${added ? styles.addDone : ''}`}
            onClick={doAddToCart}
            disabled={!product.in_stock || adding}
          >
            {!product.in_stock ? (
              t('product.outOfStock')
            ) : adding ? (
              <Spinner size={18} stroke={2} />
            ) : added ? (
              <>
                <Icon name="check" size={18} strokeWidth={2.4} /> {t('catalog.added')}
              </>
            ) : (
              <>
                {t('product.addToCart')} · {formatPrice(product.price * qty, product.currency)}
              </>
            )}
          </button>
        </div>

        {/* Faqat savatga qo'shilgandan keyin ko'rinadi */}
        {inCart && (
          <button type="button" className={`${styles.goCartBtn} pressable`} onClick={goToCart}>
            <Icon name="cart" size={18} strokeWidth={2} />
            {t('cart.goToCart')}
          </button>
        )}
      </div>
    </div>
  );
}
