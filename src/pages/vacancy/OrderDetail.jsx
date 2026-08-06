import { useCallback, useEffect, useState } from 'react';
import CopyField from '../../components/CopyField.jsx';
import Spinner from '../../components/Spinner.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import { ORDER_STATUS_LABEL, ORDER_FORMAT_LABEL } from './orderStatus.js';
import styles from './vacancy.module.css';

const POLL_MS = 5000;
const SUPPORT = '@santyx';

const ERRORS = {
  not_payable: "Bu order hozir to'lovga tayyor emas",
  only_client_pays: "To'lovni faqat mijoz amalga oshiradi",
  no_price_slot: "Hozir bo'sh to'lov summasi yo'q, birozdan keyin urinib ko'ring",
  not_materials_stage: 'Bu bosqichda materiallar kutilmayapti',
  deadline_not_expired: "Deadline hali o'tmagan",
  invalid_extra_hours: "Qo'shimcha vaqt 1–24 soat oralig'ida bo'lsin",
};

// Uzoq muddat uchun format: "02 kun 06:00:00" (deadline va 3 kunlik to'lov oynasi).
function longCountdown(target) {
  if (!target) return '—';
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "Muddat o'tdi";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hh = String(Math.floor((total % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return days > 0 ? `${String(days).padStart(2, '0')} kun ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function formatUzs(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} UZS`;
}

// Order tafsilotlari va joriy bosqich amallari (to'lov, materiallar, deadline).
export default function OrderDetail({ orderId, onBack }) {
  const [order, setOrder] = useState(null);
  const [role, setRole] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extraHours, setExtraHours] = useState('6');
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await vacancyCall('order-detail', { order_id: orderId });
      setOrder(res.order);
      setRole(res.role);
    } catch {
      setError('Order yuklanmadi.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Teskari hisoblar har soniyada yangilanadi.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // To'lov bosqichida — summa/karta ma'lumotini avtomatik olamiz.
  // To'lov aniqlangach (status o'zgaradi) oynani yopamiz.
  useEffect(() => {
    if (!order) return;
    const stage =
      order.status === 'payment_pending' ? 'first' : order.status === 'final_payment_pending' ? 'second' : null;
    if (!stage) {
      setPayment(null);
      return;
    }
    if (role !== 'client' || payment) return;
    vacancyCall(stage === 'first' ? 'order-payment-start' : 'order-final-payment-start', { order_id: orderId })
      .then((res) => setPayment(res.payment))
      .catch(() => setError("To'lov ma'lumotlari olinmadi."));
  }, [order, role, payment, orderId]);

  async function call(action, payload = {}) {
    setBusy(true);
    setError('');
    try {
      const res = await vacancyCall(action, { order_id: orderId, ...payload });
      if (res.payment) setPayment(res.payment);
      if (res.order) setOrder(res.order);
      return res;
    } catch (err) {
      setError(ERRORS[err.message] || 'Amal bajarilmadi.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className={styles.loading}>Yuklanmoqda...</div>;
  if (!order) return <div className={styles.regError}>{error || 'Order topilmadi.'}</div>;

  const isClient = role === 'client';
  const paying = ['payment_pending', 'final_payment_pending'].includes(order.status);

  return (
    <div className={styles.page}>
      <div className={styles.chatHeader}>
        <button type="button" className={styles.chatBack} onClick={onBack}>
          ←
        </button>
        <span className={styles.chatHeaderName}>Order #{order.id}</span>
      </div>

      <div className={styles.workerCard}>
        <div className={styles.workerName}>{order.title}</div>
        <div className={styles.workerMeta}>
          {ORDER_FORMAT_LABEL[order.format] || order.format} • {isClient ? 'Mijoz sifatida' : 'Ishchi sifatida'}
        </div>
        <div className={styles.orderStatusBadge}>{ORDER_STATUS_LABEL[order.status] || order.status}</div>
        <div className={styles.workerBio}>{order.description}</div>

        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <div className={styles.statValue}>{formatUzs(order.amount)}</div>
            <div className={styles.statLabel}>Umumiy summa</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>{formatUzs(isClient ? order.commission : order.worker_amount)}</div>
            <div className={styles.statLabel}>{isClient ? 'Komissiya (10%)' : 'Sizga tushadi'}</div>
          </div>
        </div>

        {order.reference_urls?.length > 0 && (
          <div className={styles.sheetBlock}>
            <div className={styles.sheetBlockTitle}>🔗 Referanslar</div>
            {order.reference_urls.map((url) => (
              <a key={url} className={styles.portfolioLink} href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            ))}
          </div>
        )}

        {order.notes && (
          <div className={styles.sheetBlock}>
            <div className={styles.sheetBlockTitle}>📝 Izoh</div>
            <div className={styles.miniListingDesc}>{order.notes}</div>
          </div>
        )}
      </div>

      {error && <div className={styles.regError}>{error}</div>}

      {/* 50% to'lovni boshlash — order qabul qilingandan keyin, mijoz uchun */}
      {order.status === 'accepted' && isClient && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>💳</span>
          <div className={styles.statusTitle}>Oldindan to'lov (50%)</div>
          <p className={styles.statusDesc}>
            Ish boshlanishi uchun {formatUzs(order.first_payment)} to'lang. To'lovga 10 daqiqa vaqt beriladi.
          </p>
          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => call('order-payment-start')}>
            To'lovga o'tish
          </button>
        </div>
      )}

      {order.status === 'accepted' && !isClient && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>⏳</span>
          <div className={styles.statusTitle}>To'lov kutilmoqda</div>
          <p className={styles.statusDesc}>Mijoz 50% oldindan to'lovni amalga oshirishi kutilmoqda.</p>
        </div>
      )}

      {/* To'lov sahifasi — taymer, summa, karta, ogohlantirish */}
      {paying && isClient && (
        <div className={styles.statusCard}>
          {!payment ? (
            <div className={styles.loading}>To'lov ma'lumotlari yuklanmoqda...</div>
          ) : (
            <>
              <div className={styles.timerBox}>
                <span className={styles.statusDesc}>Qolgan vaqt</span>
                <div className={styles.verifyCode} key={tick}>
                  {longCountdown(payment.expires_at)}
                </div>
              </div>

              <CopyField
                label="To'lanadigan summa"
                value={formatUzs(payment.amount)}
                copyValue={String(payment.amount)}
                big
              />
              <div style={{ height: 10 }} />
              <CopyField label="Karta raqami" value={payment.card_number || '—'} />

              <div className={styles.paymentWarning}>
                ⚠️ Agar kartaga tashlanadigan summa yuqoridagidan farq qilsa, to'lov tizim tomonidan aniqlanmay
                qolishi mumkin. Agar siz bankomatdan yoki chet eldan pul tashlayotgan bo'lsangiz {SUPPORT} ga
                murojaat qiling.
              </div>

              <div className={styles.waitingRow}>
                <Spinner size={18} stroke={2} />
                <span>To'lov kutilmoqda...</span>
              </div>
            </>
          )}
        </div>
      )}

      {paying && !isClient && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>⏳</span>
          <div className={styles.statusTitle}>To'lov kutilmoqda</div>
          <p className={styles.statusDesc}>
            {order.status === 'payment_pending'
              ? "Mijoz 50% oldindan to'lovni amalga oshirmoqda."
              : "Mijoz qolgan to'lovni amalga oshirmoqda (3 kun muddat)."}
          </p>
        </div>
      )}

      {/* Isxodnik materiallar */}
      {order.status === 'materials_pending' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>📦</span>
          <div className={styles.statusTitle}>Isxodnik materiallar</div>
          {isClient ? (
            <>
              <p className={styles.statusDesc}>
                Materiallarni (video, rasm, audio) shu botga yuboring. Hammasini yuborib bo'lgach, quyidagi tugmani
                bosing — shundan keyin ish boshlanadi va deadline taymeri ishga tushadi.
              </p>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy}
                onClick={() => call('order-materials-sent')}
              >
                Materiallarni jo'natdim ✓
              </button>
            </>
          ) : (
            <p className={styles.statusDesc}>Mijoz isxodnik materiallarni yuborishi kutilmoqda.</p>
          )}
        </div>
      )}

      {/* Deadline taymeri */}
      {['in_progress', 'revising'].includes(order.status) && !order.deadline_expired && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>⏰</span>
          <div className={styles.statusTitle}>Deadline</div>
          <div className={styles.verifyCode} key={tick}>
            {longCountdown(order.deadline_at)}
          </div>
          <p className={styles.statusDesc}>
            {isClient ? 'Ishchi natijani shu muddatgacha yuborishi kerak.' : 'Natijani shu muddatgacha yuboring.'}
          </p>
        </div>
      )}

      {/* Deadline o'tdi — mijozning tanlovi */}
      {order.deadline_expired && ['in_progress', 'revising'].includes(order.status) && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>⏰</span>
          <div className={styles.statusTitle}>Muddat o'tdi</div>
          {isClient ? (
            <>
              <p className={styles.statusDesc}>Montajor belgilangan muddatga ulgurmadi. Qaror qabul qiling:</p>
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                value={extraHours}
                onChange={(e) => setExtraHours(e.target.value)}
                placeholder="Qo'shimcha soat (1–24)"
              />
              <div className={styles.regActions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={busy}
                  onClick={() => call('order-deadline-respond', { choice: 'wait', extra_hours: Number(extraHours) })}
                >
                  ⏳ Kutaman
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy}
                  onClick={() => call('order-deadline-respond', { choice: 'cancel' })}
                >
                  ❌ Bekor qilish
                </button>
              </div>
              <p className={styles.note}>
                Bekor qilsangiz, to'langan {formatUzs(order.first_payment)} sizga qaytariladi.
              </p>
            </>
          ) : (
            <p className={styles.statusDesc}>
              Deadline o'tdi. Mijoz qo'shimcha vaqt berish yoki orderni bekor qilish haqida qaror qabul qilmoqda.
            </p>
          )}
        </div>
      )}

      {order.status === 'completed' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>🎉</span>
          <div className={styles.statusTitle}>Order yakunlandi</div>
          <p className={styles.statusDesc}>
            {isClient
              ? "To'lov to'liq qabul qilindi. Tayyor fayl bot orqali yuboriladi."
              : `To'lov to'liq qabul qilindi. Sizga ${formatUzs(order.worker_amount)} to'lanadi.`}
          </p>
        </div>
      )}

      {order.status === 'cancelled' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>❌</span>
          <div className={styles.statusTitle}>Order bekor qilindi</div>
        </div>
      )}
    </div>
  );
}
