import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Icon from '../components/Icon.jsx';
import CopyField from '../components/CopyField.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { formatPrice, formatDate } from '../utils/format.js';
import styles from './History.module.css';

const STATUS_KEY = {
  waiting: 'history.statusWaiting',
  confirmed: 'history.statusConfirmed',
  cancelled: 'history.statusCancelled',
};

// Ko'rsatilgan kredensiallar shuncha vaqtdan keyin o'zi yashiriladi
// (telefon ochiq qolib ketsa, ekranda parol turib qolmasin).
const AUTO_HIDE_MS = 2 * 60 * 1000;

// "Mening akkauntlarim": login/parol/kalit faqat tugma bosilganda serverdan
// olinadi (tarix ro'yxatida yuborilmaydi), ko'rsatilgach o'zi yashiriladi.
function RevealCredentials({ orderId }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: 'idle', deliveries: [], error: '' });

  useEffect(() => {
    if (state.status !== 'shown') return undefined;
    const timer = setTimeout(() => setState({ status: 'idle', deliveries: [], error: '' }), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  const reveal = async () => {
    setState({ status: 'loading', deliveries: [], error: '' });
    try {
      const res = await apiCall('my-credentials', { orderId });
      setState({ status: 'shown', deliveries: res.deliveries || [], error: '' });
    } catch (err) {
      const key = err?.status === 429 ? 'history.revealTooMany' : 'history.revealError';
      setState({ status: 'error', deliveries: [], error: t(key) });
    }
  };

  if (state.status !== 'shown') {
    return (
      <div className={styles.reveal}>
        <button type="button" className={styles.revealBtn} onClick={reveal} disabled={state.status === 'loading'}>
          👁 {state.status === 'loading' ? t('history.revealLoading') : t('history.reveal')}
        </button>
        {state.status === 'error' && <div className={styles.revealError}>{state.error}</div>}
      </div>
    );
  }

  const shown = state.deliveries.filter((d) => d.credential);
  return (
    <div className={styles.reveal}>
      <div className={styles.revealWarn}>🔒 {t('history.revealWarning')}</div>
      {shown.length === 0 && <div className={styles.revealError}>{t('history.revealNone')}</div>}
      {shown.map((d, idx) => (
        <div key={idx} className={styles.credCard}>
          <div className={styles.credName}>{d.plan_name}</div>
          {d.credential.type === 'account' && (
            <>
              <CopyField label={t('checkout.login')} value={d.credential.login} />
              <div style={{ height: 8 }} />
              <CopyField label={t('checkout.password')} value={d.credential.password} />
            </>
          )}
          {d.credential.type === 'key' && (
            <>
              <CopyField label={t('checkout.activationKey')} value={d.credential.key} />
              {d.credential.instructions ? <p className={styles.instruction}>{d.credential.instructions}</p> : null}
            </>
          )}
          {d.credential.type === 'instruction' && <p className={styles.instruction}>{d.credential.text}</p>}
        </div>
      ))}
      <button type="button" className={styles.revealBtn} onClick={() => setState({ status: 'idle', deliveries: [], error: '' })}>
        {t('history.hide')}
      </button>
    </div>
  );
}

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

              {o.can_reveal && <RevealCredentials orderId={o.id} />}

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
