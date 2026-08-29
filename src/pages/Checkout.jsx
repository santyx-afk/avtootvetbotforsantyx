import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import CopyField from '../components/CopyField.jsx';
import PaymentSteps from '../components/PaymentSteps.jsx';
import Toggle from '../components/Toggle.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useCart } from '../lib/CartProvider.jsx';
import { apiCall } from '../lib/api.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { formatPrice } from '../utils/format.js';
import { haptic } from '../telegram/webapp.js';
import ReviewModal from '../components/ReviewModal.jsx';
import { readStorage, writeStorage } from '../utils/storage.js';
import styles from './Checkout.module.css';

export default function Checkout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { setCount, refresh } = useCart();

  const [status, setStatus] = useState('loading');
  const [cart, setCart] = useState(null);
  const [useBalance, setUseBalance] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(null);
  const [promoError, setPromoError] = useState(null); // null | 'invalid' | 'wrong_plan'
  const [promoChecking, setPromoChecking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [placing, setPlacing] = useState(false);

  const [phase, setPhase] = useState('form');
  const [order, setOrder] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [showReview, setShowReview] = useState(false); // xariddan keyingi sharh modali

  const loadCart = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await apiCall('cart');
      setCart(res);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  const items = cart?.items || [];
  const currency = items[0]?.currency || 'UZS';
  const yourSum = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const promoDiscount = promo?.discount || 0;
  const balance = cart?.balance || 0;
  const balanceApplied = useBalance ? Math.min(balance, Math.max(0, yourSum - promoDiscount)) : 0;
  const amountPreview = Math.max(0, yourSum - promoDiscount - balanceApplied);
  // Qoidalar bo'lsagina rozilik talab qilinadi; bo'lmasa blok umuman ko'rinmaydi
  const hasRules = items.some((i) => i.rules) || Boolean(cart?.general_terms);
  const canPay = hasRules ? agreed : true;

  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code) return;
    haptic.impact('light');
    setPromoChecking(true);
    setPromoError(null);
    try {
      const res = await apiCall('promo-validate', { code });
      if (res.valid) {
        setPromo({ code: res.code, discount: res.discount, cashback: res.cashback || 0 });
        haptic.notification('success');
      } else {
        setPromo(null);
        // Promokod tovarga bog'langan bo'lsa alohida matn — mijoz kodni
        // noto'g'ri deb o'ylab qayta-qayta urinmasin.
        setPromoError(res.reason === 'wrong_plan' ? 'wrong_plan' : 'invalid');
        haptic.notification('error');
      }
    } catch {
      setPromoError('invalid');
    } finally {
      setPromoChecking(false);
    }
  };

  const place = async () => {
    if (!canPay || placing) return;
    haptic.impact('medium');
    setPlacing(true);
    try {
      const res = await apiCall('checkout', {
        useBalance,
        promoCode: promo?.code || null,
      });
      setOrder(res);
      setCount(0);
      refresh();
      setPhase(res.fully_paid ? 'result' : 'payment');
    } catch {
      haptic.notification('error');
      setPlacing(false);
    }
  };

  const { mmss, expired } = useCountdown(phase !== 'form' ? order?.expires_at : null);

  const terminal =
    statusData &&
    (statusData.delivered || statusData.waiting_stock || statusData.manual || statusData.expired);

  // order-status polling (payment va result fazalarida, terminal holatgacha)
  useEffect(() => {
    if (phase === 'form' || !order?.order_id || terminal) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const s = await apiCall('order-status', { orderId: order.order_id });
        if (!active) return;
        setStatusData(s);
        if (s.paid || s.delivered || s.waiting_stock || s.manual || s.expired) setPhase('result');
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

  // Timer tugadi, to'lov aniqlanmadi → muddat tugadi
  useEffect(() => {
    if (phase === 'payment' && expired && !statusData?.paid) setPhase('result');
  }, [expired, phase, statusData]);

  // Natija haptik javobi (bir marta)
  useEffect(() => {
    if (phase !== 'result' || !statusData) return;
    if (statusData.delivered || statusData.waiting_stock || statusData.manual) {
      haptic.notification('success');
    } else if (statusData.expired) {
      haptic.notification('warning');
    }
  }, [phase, statusData?.delivered, statusData?.waiting_stock, statusData?.manual, statusData?.expired]);

  // Muvaffaqiyatli xariddan keyin sharh modalini (shu buyurtma uchun BIR marta) ko'rsatamiz
  useEffect(() => {
    if (phase !== 'result' || !order?.order_id || !items[0]?.plan_id) return undefined;
    const success =
      statusData &&
      !statusData.expired &&
      (statusData.paid || statusData.delivered || statusData.waiting_stock || statusData.manual);
    if (!success) return undefined;
    if (readStorage(`reviewedOrder:${order.order_id}`, false)) return undefined;
    const timer = setTimeout(() => setShowReview(true), 1500);
    return () => clearTimeout(timer);
  }, [phase, order, items, statusData?.paid, statusData?.delivered, statusData?.waiting_stock, statusData?.manual, statusData?.expired]);

  const closeReview = () => {
    setShowReview(false);
    if (order?.order_id) writeStorage(`reviewedOrder:${order.order_id}`, true);
  };

  /* ---------- Renderlar ---------- */

  if (status === 'loading') {
    return (
      <div className={styles.center}>
        <Spinner size={30} />
      </div>
    );
  }
  if (status === 'error') {
    return <ErrorState onRetry={loadCart} />;
  }
  if (!items.length && phase === 'form') {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.floatBack} onClick={() => navigate('/catalog')}>
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
        </button>
        <div className={styles.center}>
          <p className={styles.dim}>{t('checkout.emptyCart')}</p>
        </div>
      </div>
    );
  }

  // ---------- FORM ----------
  if (phase === 'form') {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
            <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          </button>
          <h1>{t('checkout.title')}</h1>
        </div>

        <div className={styles.body}>
          {/* Buyurtma */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>{t('checkout.summary')}</div>
            {items.map((i) => (
              <div key={i.id} className={styles.orderRow}>
                <span className={styles.orderName}>
                  {i.name} {i.quantity > 1 && <span className={styles.qtyTag}>×{i.quantity}</span>}
                </span>
                <span>{formatPrice(i.price * i.quantity, currency)}</span>
              </div>
            ))}
          </div>

          {/* Balans */}
          {balance > 0 && (
            <div className={styles.card}>
              <div className={styles.toggleRow}>
                <div>
                  <div className={styles.toggleLabel}>{t('checkout.useBalance')}</div>
                  <div className={styles.toggleHint}>
                    {t('checkout.currentBalance', { amount: formatPrice(balance, currency) })}
                  </div>
                </div>
                <Toggle checked={useBalance} onChange={setUseBalance} />
              </div>
            </div>
          )}

          {/* Promokod */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>{t('checkout.promo')}</div>
            <div className={styles.promoRow}>
              <input
                className={styles.promoInput}
                placeholder={t('checkout.promoPlaceholder')}
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value);
                  setPromoError(false);
                }}
              />
              <button type="button" className={styles.promoBtn} onClick={applyPromo} disabled={promoChecking}>
                {promoChecking ? <Spinner size={16} stroke={2} /> : <Icon name="chevronRight" size={20} strokeWidth={2.4} />}
              </button>
            </div>
            {promo &&
              (promo.cashback > 0 ? (
                <div className={styles.promoOk}>✓ {t('checkout.promoCashback', { amount: formatPrice(promo.cashback, currency) })}</div>
              ) : (
                <div className={styles.promoOk}>✓ {t('checkout.promoApplied')} (−{formatPrice(promoDiscount, currency)})</div>
              ))}
            {promoError && (
              <div className={styles.promoErr}>
                {t(promoError === 'wrong_plan' ? 'checkout.promoWrongPlan' : 'checkout.promoInvalid')}
              </div>
            )}
          </div>

          {/* Qoidalar — faqat admin qoida kiritgan bo'lsa ko'rinadi */}
          {hasRules && (
            <div className={styles.card}>
              <div className={styles.cardTitle}>{t('checkout.rulesTitle')}</div>
              <div className={styles.rulesText}>
                {items
                  .filter((i) => i.rules)
                  .map((i) => (
                    <p key={i.id}>
                      <b>{i.name}:</b> {i.rules}
                    </p>
                  ))}
                {cart?.general_terms ? <p className={styles.generalTerms}>{cart.general_terms}</p> : null}
              </div>
              <label className={styles.agreeRow}>
                <span
                  className={`${styles.checkbox} ${agreed ? styles.checkboxOn : ''}`}
                  onClick={() => {
                    haptic.selection();
                    setAgreed((v) => !v);
                  }}
                >
                  {agreed && <Icon name="check" size={15} strokeWidth={3} />}
                </span>
                <span className={styles.agreeText}>{t('checkout.rulesAgree')}</span>
              </label>
            </div>
          )}

          {/* Yakuniy narx */}
          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>{t('cart.total')}</span>
              <span>{formatPrice(yourSum, currency)}</span>
            </div>
            {promoDiscount > 0 && (
              <div className={styles.totalRow}>
                <span>{t('checkout.discount')}</span>
                <span className={styles.minus}>−{formatPrice(promoDiscount, currency)}</span>
              </div>
            )}
            {balanceApplied > 0 && (
              <div className={styles.totalRow}>
                <span>{t('checkout.fromBalance')}</span>
                <span className={styles.minus}>−{formatPrice(balanceApplied, currency)}</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.actionBar}>
          <button
            type="button"
            className={styles.payBtn}
            onClick={place}
            disabled={!canPay || placing}
          >
            {placing ? (
              <Spinner size={18} stroke={2} />
            ) : (
              <>
                {t('checkout.startPayment')} · {formatPrice(amountPreview, currency)}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ---------- PAYMENT ----------
  if (phase === 'payment') {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={() => navigate('/cart')}>
            <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          </button>
          <h1>{t('checkout.payTitle')}</h1>
        </div>

        <div className={styles.body}>
          {/* 3 qadamli ko'rsatma TopUp bilan umumiy komponentda */}
          <PaymentSteps
            mmss={mmss}
            amount={order.amount}
            cardNumber={order.card_number}
            support={order.support}
            currency={currency}
          />
        </div>
      </div>
    );
  }

  // ---------- RESULT ----------
  const isExpired = statusData?.expired || (expired && !statusData?.paid && !statusData?.delivered);
  const delivered = statusData?.delivered;
  const waitingStock = statusData?.waiting_stock;
  const manual = statusData?.manual;
  const paidPending = statusData?.paid && !delivered && !waitingStock && !manual && !isExpired;

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
        ) : delivered ? (
          <>
            <div className={`${styles.resIcon} ${styles.resOk}`}>
              <Icon name="check" size={36} strokeWidth={3} />
            </div>
            <h2>{t('checkout.successTitle')}</h2>
            <p>{t('checkout.successText')}</p>

            <div className={styles.creds}>
              <div className={styles.credsTitle}>{t('checkout.yourSubscriptions')}</div>
              {(statusData.deliveries || []).map((d, idx) => (
                <div key={idx} className={styles.credCard}>
                  <div className={styles.credName}>{d.plan_name}</div>
                  {d.credential?.type === 'account' && (
                    <>
                      <CopyField label={t('checkout.login')} value={d.credential.login} />
                      <div style={{ height: 8 }} />
                      <CopyField label={t('checkout.password')} value={d.credential.password} />
                    </>
                  )}
                  {d.credential?.type === 'key' && (
                    <CopyField label={t('checkout.activationKey')} value={d.credential.key} />
                  )}
                  {d.credential?.type === 'instruction' && (
                    <p className={styles.instruction}>{d.credential.text}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : waitingStock ? (
          <>
            <div className={`${styles.resIcon} ${styles.resOk}`}>
              <Icon name="check" size={36} strokeWidth={3} />
            </div>
            <h2>{t('checkout.waitingStockTitle')}</h2>
            <p>{t('checkout.waitingStockText')}</p>
          </>
        ) : manual ? (
          <>
            <div className={`${styles.resIcon} ${styles.resOk}`}>
              <Icon name="check" size={36} strokeWidth={3} />
            </div>
            <h2>{t('checkout.successTitle')}</h2>
            <p>{t('checkout.manualText')}</p>
          </>
        ) : paidPending ? (
          <>
            <div className={styles.resSpinner}>
              <Spinner size={34} />
            </div>
            <h2>{t('checkout.successTitle')}</h2>
            <p>{t('checkout.checking')}</p>
          </>
        ) : (
          <>
            <div className={styles.resSpinner}>
              <Spinner size={34} />
            </div>
            <p>{t('checkout.checking')}</p>
          </>
        )}

        <button
          type="button"
          className={styles.backCatalog}
          onClick={() => navigate('/catalog')}
        >
          {t('checkout.backToCatalog')}
        </button>
      </div>

      {showReview && (
        <ReviewModal planId={items[0]?.plan_id} orderId={order?.order_id} onClose={closeReview} />
      )}
    </div>
  );
}
