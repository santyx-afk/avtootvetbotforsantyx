import { useCallback, useEffect, useRef, useState } from 'react';
import CopyField from '../../components/CopyField.jsx';
import Spinner from '../../components/Spinner.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import ProtectedMedia from './ProtectedMedia.jsx';
import { ORDER_STATUS_LABEL, ORDER_FORMAT_LABEL } from './orderStatus.js';
import styles from './vacancy.module.css';

const POLL_MS = 5000;
const SUPPORT = '@santyx';
const MAX_REVISIONS = 3;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ERRORS = {
  not_payable: "Bu order hozir to'lovga tayyor emas",
  only_client_pays: "To'lovni faqat mijoz amalga oshiradi",
  no_price_slot: "Hozir bo'sh to'lov summasi yo'q, birozdan keyin urinib ko'ring",
  not_materials_stage: 'Bu bosqichda materiallar kutilmayapti',
  deadline_not_expired: "Deadline hali o'tmagan",
  invalid_extra_hours: "Qo'shimcha vaqt 1–24 soat oralig'ida bo'lsin",
  not_result_stage: 'Bu bosqichda natija yuborilmaydi',
  not_reviewable: 'Bu order hozir tekshiruvda emas',
  only_worker: 'Bu amalni faqat montajor bajaradi',
  only_client: 'Bu amalni faqat mijoz bajaradi',
  media_required: 'Fayl tanlang',
  media_too_large: "Fayl 4 MB dan katta bo'lmasin",
  invalid_media_type: 'Faqat JPEG, PNG, WebP, MP4, MOV',
  invalid_comment: "Nima o'zgartirish kerakligini batafsilroq yozing",
  not_completed: 'Baho faqat order yakunlangandan keyin qo‘yiladi',
  invalid_rating: '1 dan 5 gacha yulduz tanlang',
  already_reviewed: 'Siz allaqachon baho qo‘ygansiz',
  invalid_reason: 'Sababni batafsilroq yozing',
  already_reported: 'Bu order bo‘yicha shikoyatingiz ko‘rib chiqilmoqda',
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
  const [revising, setRevising] = useState(false);
  const [revisionComment, setRevisionComment] = useState('');
  const [confirmPayment, setConfirmPayment] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [myReview, setMyReview] = useState(null);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const resultFileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await vacancyCall('order-detail', { order_id: orderId });
      setOrder(res.order);
      setRole(res.role);
      setCanReview(Boolean(res.can_review));
      setMyReview(res.my_review || null);
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

  // Montajor natijani yuboradi.
  async function sendResult(file) {
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      setError(ERRORS.media_too_large);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await fileToBase64(file);
      const res = await vacancyCall('order-result-send', {
        order_id: orderId,
        media: { type: file.type, data },
      });
      setOrder(res.order);
    } catch (err) {
      setError(ERRORS[err.message] || 'Natija yuborilmadi.');
    } finally {
      setBusy(false);
      if (resultFileRef.current) resultFileRef.current.value = '';
    }
  }

  async function submitReport() {
    setBusy(true);
    setError('');
    try {
      await vacancyCall('order-report', { order_id: orderId, reason: reportReason.trim() });
      setReporting(false);
      setReportReason('');
      setReportSent(true);
    } catch (err) {
      setError(ERRORS[err.message] || 'Shikoyat yuborilmadi.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    setBusy(true);
    setError('');
    try {
      await vacancyCall('order-review', { order_id: orderId, rating, comment: reviewComment.trim() });
      setCanReview(false);
      setMyReview({ rating, comment: reviewComment.trim() });
    } catch (err) {
      setError(ERRORS[err.message] || 'Baho yuborilmadi.');
    } finally {
      setBusy(false);
    }
  }

  async function submitRevision() {
    const res = await call('order-request-revision', { comment: revisionComment.trim() });
    if (res) {
      setRevising(false);
      setRevisionComment('');
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

      {/* Montajor natijani yuboradi (in_progress / revising) */}
      {['in_progress', 'revising'].includes(order.status) && !isClient && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>📤</span>
          <div className={styles.statusTitle}>Natijani yuborish</div>
          <p className={styles.statusDesc}>
            Tayyor ishni yuboring — mijoz uni himoyalangan ko&apos;rinishda ko&apos;radi (yuklab bo&apos;lmaydi).
            Yakuniy fayl to&apos;liq to&apos;lovdan keyin beriladi.
          </p>
          {order.revision_count > 0 && (
            <p className={styles.note}>
              O&apos;zgartirishlar: {order.revision_count}/{MAX_REVISIONS}
            </p>
          )}
          <input
            ref={resultFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            hidden
            onChange={(e) => sendResult(e.target.files?.[0])}
          />
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={busy}
            onClick={() => resultFileRef.current?.click()}
          >
            {busy ? 'Yuklanmoqda...' : '📎 Natijani tanlash'}
          </button>
        </div>
      )}

      {/* Natija yuborildi — montajor tomonida kutish + to'lov so'rash */}
      {['result_sent', 'reviewing'].includes(order.status) && !isClient && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>⏳</span>
          <div className={styles.statusTitle}>
            {order.status === 'reviewing' ? 'Mijoz tekshirmoqda' : 'Natija yuborildi'}
          </div>
          <p className={styles.statusDesc}>Mijoz natijani ko&apos;rib chiqmoqda.</p>
          {order.status === 'result_sent' && (
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => setConfirmPayment(true)}>
              Qolgan to&apos;lovni so&apos;rash
            </button>
          )}
        </div>
      )}

      {/* Mijoz natijani ko'radi va 3 ta tanlovdan birini qiladi */}
      {['result_sent', 'reviewing'].includes(order.status) && isClient && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>🎬</span>
          <div className={styles.statusTitle}>Natija tayyor</div>

          {order.result_media_url && (
            <ProtectedMedia url={order.result_media_url} type={order.result_media_kind || 'image'} />
          )}

          <p className={styles.statusDesc}>
            Natijani ko&apos;rib chiqing. Qabul qilsangiz qolgan {formatUzs(order.second_payment)} to&apos;lovga
            o&apos;tasiz.
          </p>

          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => call('order-approve-result')}>
            ✅ Qabul qildim
          </button>

          <div className={styles.regActions}>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={busy}
              onClick={() => setRevising(true)}
            >
              ✏️ O&apos;zgartirish kerak
            </button>
          </div>
          <p className={styles.note}>
            O&apos;zgartirishlar: {order.revision_count}/{MAX_REVISIONS}
            {order.revision_count >= MAX_REVISIONS && ' — limit tugadi, keyingi so‘rov nizoga aylanadi'}
          </p>
        </div>
      )}

      {order.status === 'disputed' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>🚩</span>
          <div className={styles.statusTitle}>Nizo ochildi</div>
          <p className={styles.statusDesc}>
            O&apos;zgartirish limiti tugadi va tomonlar kelisha olmadi. Admin ko&apos;rib chiqmoqda.
          </p>
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

      {/* Ikki tomonlama baho — order yakunlangach har tomon bir marta qo'yadi */}
      {order.status === 'completed' && (canReview || myReview) && (
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>
            {myReview ? 'Sizning bahoyingiz' : `⭐ ${isClient ? 'Montajorni' : 'Mijozni'} baholang`}
          </div>

          {myReview ? (
            <>
              <div className={styles.starsStatic}>{'⭐'.repeat(myReview.rating)}</div>
              {myReview.comment && <p className={styles.statusDesc}>{myReview.comment}</p>}
            </>
          ) : (
            <>
              <p className={styles.statusDesc}>Ish qanday bo&apos;ldi?</p>
              <div className={styles.starRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={n <= rating ? styles.starOn : styles.starOff}
                    onClick={() => setRating(n)}
                    aria-label={`${n} yulduz`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                className={styles.textarea}
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Izoh qoldiring (ixtiyoriy)"
                maxLength={1000}
              />
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy || rating < 1}
                onClick={submitReview}
              >
                Yuborish
              </button>
            </>
          )}
        </div>
      )}

      {order.status === 'cancelled' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>❌</span>
          <div className={styles.statusTitle}>Order bekor qilindi</div>
        </div>
      )}

      {/* Shikoyat — bekor qilingan/yakunlanganidan tashqari har bosqichda */}
      {!['cancelled'].includes(order.status) && (
        <div className={styles.reportRow}>
          {reportSent ? (
            <span className={styles.note}>🚩 Shikoyatingiz yuborildi — admin ko&apos;rib chiqadi.</span>
          ) : (
            <button type="button" className={styles.reportBtn} onClick={() => setReporting(true)}>
              🚩 Shikoyat qilish
            </button>
          )}
        </div>
      )}

      {reporting && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>🚩 Shikoyat</h2>
            <p className={styles.statusDesc}>
              Muammoni batafsil yozing. Admin chat tarixi va order tafsilotlarini ko&apos;rib chiqadi.
            </p>
            <textarea
              className={styles.textarea}
              rows={4}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Nima sababdan shikoyat qilyapsiz?"
              maxLength={1000}
            />
            <div className={styles.regActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setReporting(false)} disabled={busy}>
                Bekor qilish
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={submitReport}
                disabled={busy || reportReason.trim().length < 5}
              >
                Yuborish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* O'zgartirish so'rash modali */}
      {revising && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>✏️ O&apos;zgartirish kerak</h2>
            <p className={styles.statusDesc}>
              Nima o&apos;zgartirish kerakligini aniq yozing. Bu {order.revision_count + 1}-o&apos;zgartirish
              (limit: {MAX_REVISIONS}).
            </p>
            <textarea
              className={styles.textarea}
              rows={4}
              value={revisionComment}
              onChange={(e) => setRevisionComment(e.target.value)}
              placeholder="Masalan: 0:15 dagi musiqani almashtiring, oxirgi kadr uzunroq bo'lsin..."
              maxLength={1000}
            />
            <div className={styles.regActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setRevising(false)} disabled={busy}>
                Bekor qilish
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={submitRevision}
                disabled={busy || revisionComment.trim().length < 5}
              >
                Yuborish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Montajor uchun ogohlantirish — to'lov so'rashdan oldin */}
      {confirmPayment && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>⚠️ Muhim!</h2>
            <p className={styles.statusDesc}>Mijoz natijadan qanoatlandimi?</p>
            <p className={styles.statusDesc}>
              Yakuniy to&apos;lovni so&apos;rashdan oldin mijoz natijani qabul qilganini tasdiqlang.
            </p>
            <div className={styles.paymentWarning}>
              Qoidaga amal qilmaslik ban ga olib kelishi mumkin.
            </div>
            <div className={styles.regActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setConfirmPayment(false)} disabled={busy}>
                Orqaga
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy}
                onClick={async () => {
                  const res = await call('order-request-payment');
                  if (res) setConfirmPayment(false);
                }}
              >
                Mijoz tasdiqladi ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
