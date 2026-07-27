import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import CopyField from '../components/CopyField.jsx';
import Spinner from '../components/Spinner.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { formatPrice, formatNumber } from '../utils/format.js';
import { haptic } from '../telegram/webapp.js';
import styles from './TopUp.module.css';

export default function TopUp() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [config, setConfig] = useState(null);
  const [amount, setAmount] = useState('');
  const [placing, setPlacing] = useState(false);
  const [phase, setPhase] = useState('form');
  const [order, setOrder] = useState(null);
  const [statusData, setStatusData] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiCall('profile');
      setConfig({
        min: res.min_topup || 5000,
        cashbackEnabled: res.cashback_enabled,
        cashbackPercent: res.cashback_percent || 10,
        currency: 'UZS',
      });
    } catch {
      setConfig({ min: 5000, cashbackEnabled: false, cashbackPercent: 10, currency: 'UZS' });
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const min = config?.min || 5000;
  const currency = config?.currency || 'UZS';
  const base = Math.round(Number(amount) || 0);
  const valid = base >= min;
  const cashbackAmt =
    config?.cashbackEnabled && valid ? Math.round((base * config.cashbackPercent) / 100) : 0;
  const getAmount = valid ? base + cashbackAmt : 0;

  const proceed = async () => {
    if (!valid || placing) return;
    haptic.impact('medium');
    setPlacing(true);
    try {
      const res = await apiCall('topup', { amount: base });
      setOrder(res);
      setPhase('payment');
    } catch (e) {
      haptic.notification('error');
      setPlacing(false);
    }
  };

  const { mmss, expired } = useCountdown(phase !== 'form' ? order?.expires_at : null);
  const terminal = statusData && (statusData.delivered || statusData.expired);

  useEffect(() => {
    if (phase === 'form' || !order?.order_id || terminal) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const s = await apiCall('order-status', { orderId: order.order_id });
        if (!active) return;
        setStatusData(s);
        if (s.delivered || s.expired) setPhase('result');
      } catch {
        /* keyingi urinishda */
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [phase, order, terminal]);

  useEffect(() => {
    if (phase === 'payment' && expired && !statusData?.delivered) setPhase('result');
  }, [expired, phase, statusData]);

  // Natija haptik javobi (bir marta)
  useEffect(() => {
    if (phase !== 'result' || !statusData) return;
    if (statusData.delivered) haptic.notification('success');
    else if (statusData.expired) haptic.notification('warning');
  }, [phase, statusData?.delivered, statusData?.expired]);

  const quickAmounts = [10000, 25000, 50000, 100000].filter((v) => v >= min);

  /* ---------- FORM ---------- */
  if (phase === 'form') {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
            <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          </button>
          <h1>{t('topup.title')}</h1>
        </div>

        <div className={styles.body}>
          <div className={styles.inputCard}>
            <label className={styles.inputLabel}>{t('topup.amountLabel')}</label>
            <div className={styles.inputRow}>
              <input
                type="number"
                inputMode="numeric"
                className={styles.input}
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className={styles.currency}>{currency}</span>
            </div>
            <div className={styles.minHint}>{t('topup.minHint', { amount: formatPrice(min, currency) })}</div>

            <div className={styles.quick}>
              {quickAmounts.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => {
                    haptic.selection();
                    setAmount(String(v));
                  }}
                >
                  {formatNumber(v)}
                </button>
              ))}
            </div>
          </div>

          {config?.cashbackEnabled && (
            <div className={styles.cashbackBadge}>
              <span>🎁</span>
              {t('topup.cashback', { percent: config.cashbackPercent })}
            </div>
          )}

          {valid && (
            <div className={styles.preview}>
              <div className={styles.previewRow}>
                <span>{t('topup.youPay')}</span>
                <span>≈ {formatPrice(base, currency)}</span>
              </div>
              {cashbackAmt > 0 && (
                <div className={styles.previewRow}>
                  <span>{t('topup.cashbackRow', { percent: config.cashbackPercent })}</span>
                  <span className={styles.bonus}>+{formatPrice(cashbackAmt, currency)}</span>
                </div>
              )}
              <div className={styles.divider} />
              <div className={`${styles.previewRow} ${styles.previewTotal}`}>
                <span>{t('topup.youGet')}</span>
                <span>≈ {formatPrice(getAmount, currency)}</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.actionBar}>
          <button type="button" className={styles.payBtn} onClick={proceed} disabled={!valid || placing}>
            {placing ? <Spinner size={18} stroke={2} /> : t('topup.topUpButton')}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- PAYMENT ---------- */
  if (phase === 'payment') {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={() => navigate('/profile')}>
            <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          </button>
          <h1>{t('checkout.payTitle')}</h1>
        </div>

        <div className={styles.body}>
          <div className={styles.timerBox}>
            <span className={styles.timerLabel}>{t('checkout.timeLeft')}</span>
            <span className={styles.timer}>{mmss}</span>
          </div>

          <CopyField label={t('checkout.amountToPay')} value={formatPrice(order.amount, currency)} copyValue={String(order.amount)} big />
          <div style={{ height: 10 }} />
          <CopyField label={t('checkout.cardNumber')} value={order.card_number} />

          <div className={styles.warning}>
            <Icon name="alert" size={20} />
            <p>{t('checkout.warning', { support: order.support || '@santyx' })}</p>
          </div>

          <div className={styles.waiting}>
            <Spinner size={18} stroke={2} />
            <span>{t('checkout.waitingPayment')}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- RESULT ---------- */
  const isExpired = statusData?.expired || (expired && !statusData?.delivered);

  return (
    <div className={styles.page}>
      <div className={styles.result}>
        {isExpired ? (
          <>
            <div className={`${styles.resIcon} ${styles.resWarn}`}>
              <Icon name="alert" size={34} />
            </div>
            <h2>{t('checkout.expiredTitle')}</h2>
            <p>{t('checkout.expiredText')}</p>
          </>
        ) : statusData?.delivered ? (
          <>
            <div className={`${styles.resIcon} ${styles.resOk}`}>
              <Icon name="check" size={36} strokeWidth={3} />
            </div>
            <h2>{t('topup.successTitle')}</h2>
            <p>{t('topup.successText', { amount: formatPrice(order.credit, currency) })}</p>
          </>
        ) : (
          <>
            <div className={styles.resSpinner}>
              <Spinner size={34} />
            </div>
            <p>{t('checkout.checking')}</p>
          </>
        )}

        <button type="button" className={styles.backCatalog} onClick={() => navigate('/profile')}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
