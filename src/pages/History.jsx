import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { formatPrice, formatDate } from '../utils/format.js';
import styles from './History.module.css';

const STATUS_KEY = {
  waiting: 'history.statusWaiting',
  confirmed: 'history.statusConfirmed',
  cancelled: 'history.statusCancelled',
};

export default function History() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState('loading');
  const [orders, setOrders] = useState([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await apiCall('history');
      setOrders(res.orders || []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const localeMap = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
  const locale = localeMap[lang];

  if (status === 'loading') {
    return (
      <>
        <PageHeader title={t('pages.history.title')} />
        <div className="app-container">
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skel}>
              <Skeleton height={18} width="50%" />
              <Skeleton height={14} width="80%" style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader title={t('pages.history.title')} />
        <ErrorState onRetry={load} />
      </>
    );
  }

  if (!orders.length) {
    return (
      <>
        <PageHeader title={t('pages.history.title')} />
        <EmptyState emoji="🧾" title={t('pages.history.empty')} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('pages.history.title')} />
      <div className="app-container">
        <div className={styles.list}>
          {orders.map((o) => (
            <div key={o.id} className={styles.card}>
              <div className={styles.top}>
                <span className={styles.orderNo}>{t('history.orderNumber', { n: o.order_number })}</span>
                <span className={`${styles.chip} ${styles[o.status]}`}>{t(STATUS_KEY[o.status])}</span>
              </div>

              <div className={styles.date}>{formatDate(o.created_at, locale)}</div>

              <div className={styles.items}>
                {o.items.length > 0 ? (
                  o.items.map((it, idx) => (
                    <div key={idx} className={styles.itemRow}>
                      <span className={styles.itemName}>
                        {it.name}
                        {it.quantity > 1 && <span className={styles.qty}> ×{it.quantity}</span>}
                      </span>
                      <span className={styles.itemPrice}>
                        {formatPrice(it.price * it.quantity, o.currency)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className={styles.itemRow}>
                    <span className={styles.itemName}>#{o.order_number}</span>
                    <span className={styles.itemPrice}>{formatPrice(o.amount, o.currency)}</span>
                  </div>
                )}
              </div>

              {o.subscription?.expires_at && (
                <div className={styles.period}>
                  <Icon name="clock" size={15} />
                  <span>
                    {t('history.period')}: {formatDate(o.subscription.started_at, locale)} —{' '}
                    {formatDate(o.subscription.expires_at, locale)}
                  </span>
                </div>
              )}

              <div className={styles.divider} />
              <div className={styles.total}>
                <span>{t('cart.total')}</span>
                <span>{formatPrice(o.amount, o.currency)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
