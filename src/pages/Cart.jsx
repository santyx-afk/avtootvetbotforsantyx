import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useCart } from '../lib/CartProvider.jsx';
import { apiCall } from '../lib/api.js';
import { formatPrice } from '../utils/format.js';
import { haptic } from '../telegram/webapp.js';
import styles from './Cart.module.css';

export default function Cart() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { setCount } = useCart();

  const [status, setStatus] = useState('loading');
  const [items, setItems] = useState([]);

  const syncCount = useCallback(
    (list) => setCount(list.reduce((s, i) => s + Number(i.quantity || 0), 0)),
    [setCount],
  );

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await apiCall('cart');
      setItems(res.items || []);
      syncCount(res.items || []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [syncCount]);

  useEffect(() => {
    load();
  }, [load]);

  const changeQty = async (item, delta) => {
    const q = Math.min(5, Math.max(1, item.quantity + delta));
    if (q === item.quantity) return;
    haptic.selection();
    const next = items.map((i) => (i.id === item.id ? { ...i, quantity: q } : i));
    setItems(next);
    syncCount(next);
    try {
      await apiCall('cart-update', { itemId: item.id, quantity: q });
    } catch {
      load();
    }
  };

  const remove = async (item) => {
    haptic.impact('medium');
    const next = items.filter((i) => i.id !== item.id);
    setItems(next);
    syncCount(next);
    try {
      await apiCall('cart-remove', { itemId: item.id });
    } catch {
      load();
    }
  };

  if (status === 'loading') {
    return (
      <>
        <PageHeader title={t('pages.cart.title')} />
        <div className="app-container">
          {[1, 2].map((i) => (
            <div key={i} className={styles.skelRow}>
              <Skeleton width={64} height={64} radius={12} />
              <div style={{ flex: 1 }}>
                <Skeleton height={16} width="70%" />
                <Skeleton height={14} width="40%" style={{ marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader title={t('pages.cart.title')} />
        <ErrorState onRetry={load} />
      </>
    );
  }

  if (!items.length) {
    return (
      <>
        <PageHeader title={t('pages.cart.title')} />
        <EmptyState
          emoji="🛒"
          title={t('pages.cart.empty')}
          hint={t('pages.cart.emptyHint')}
          action={
            <button type="button" className={styles.browseBtn} onClick={() => navigate('/catalog')}>
              {t('checkout.backToCatalog')}
            </button>
          }
        />
      </>
    );
  }

  const officialSum = items.reduce(
    (s, i) => s + Number(i.old_price ?? i.price) * i.quantity,
    0,
  );
  const yourSum = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const saved = Math.max(0, officialSum - yourSum);
  const currency = items[0]?.currency || 'UZS';

  return (
    <>
      <PageHeader title={t('pages.cart.title')} />

      <div className={`app-container ${styles.wrap}`}>
        {/* Elementlar */}
        <div className={styles.list}>
          {items.map((item) => (
            <div key={item.id} className={styles.item}>
              <div className={styles.thumb}>
                {item.image_url ? (
                  <img src={item.image_url} alt="" />
                ) : (
                  <span>{(item.name || '?').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className={styles.info}>
                <div className={styles.name}>{item.name}</div>
                <div className={styles.prices}>
                  <span className={styles.price}>{formatPrice(item.price, item.currency)}</span>
                  {item.old_price && item.old_price > item.price ? (
                    <span className={styles.old}>{formatPrice(item.old_price)}</span>
                  ) : null}
                </div>
                <div className={styles.controls}>
                  <div className={styles.stepper}>
                    <button type="button" onClick={() => changeQty(item, -1)} disabled={item.quantity <= 1}>
                      <Icon name="minus" size={16} strokeWidth={2.4} />
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => changeQty(item, 1)} disabled={item.quantity >= 5}>
                      <Icon name="plus" size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                  <button type="button" className={styles.remove} onClick={() => remove(item)}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Narxlar */}
        <div className={styles.summary}>
          <div className={styles.sumRow}>
            <span>{t('cart.official')}</span>
            <span className={styles.strike}>{formatPrice(officialSum, currency)}</span>
          </div>
          <div className={styles.sumRow}>
            <span>{t('cart.yourPrice')}</span>
            <span>{formatPrice(yourSum, currency)}</span>
          </div>
          {saved > 0 && (
            <div className={`${styles.sumRow} ${styles.savedRow}`}>
              <span>{t('cart.totalSaved')}</span>
              <span>{formatPrice(saved, currency)}</span>
            </div>
          )}
          <div className={styles.divider} />
          <div className={`${styles.sumRow} ${styles.totalRow}`}>
            <span>{t('cart.total')}</span>
            <span>{formatPrice(yourSum, currency)}</span>
          </div>
        </div>
      </div>

      {/* Sticky checkout */}
      <div className={styles.checkoutBar}>
        <button type="button" className={styles.checkoutBtn} onClick={() => navigate('/checkout')}>
          <span>{t('cart.checkout')}</span>
          <span className={styles.checkoutTotal}>{formatPrice(yourSum, currency)}</span>
        </button>
      </div>
    </>
  );
}
