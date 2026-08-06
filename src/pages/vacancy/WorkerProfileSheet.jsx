import { useEffect, useState } from 'react';
import { vacancyCall } from '../../lib/vacancyApi.js';
import styles from './vacancy.module.css';

const EXPERIENCE_LABEL = { 0: '1 yildan kam', 1: '1-2 yil', 2: '2-5 yil', 5: '5+ yil' };
const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };
const DAYS = [
  ['mon', 'Du'], ['tue', 'Se'], ['wed', 'Cho'], ['thu', 'Pa'],
  ['fri', 'Ju'], ['sat', 'Sha'], ['sun', 'Ya'],
];

const CHAT_ERRORS = {
  self_chat: 'O’zingizga yoza olmaysiz',
  worker_busy: 'Ishchi hozir band',
  worker_banned: 'Ishchi mavjud emas',
};

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

// Ishchining ochiq profili — e'lonlari, ish vaqti va sharhlari.
export default function WorkerProfileSheet({ workerId, onClose, onOpenChat }) {
  const [data, setData] = useState(null);
  const [allReviews, setAllReviews] = useState(false);
  const [starting, setStarting] = useState(false);
  const [chatError, setChatError] = useState('');

  async function startChat(listingId) {
    setStarting(true);
    setChatError('');
    try {
      const res = await vacancyCall('chat-start', { listing_id: listingId });
      onOpenChat?.(res.chat_id);
    } catch (err) {
      setChatError(CHAT_ERRORS[err.message] || 'Chat ochilmadi.');
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    let alive = true;
    vacancyCall('worker-public', { worker_id: workerId })
      .then((res) => alive && setData(res))
      .catch(() => alive && setData({ error: true }));
    return () => {
      alive = false;
    };
  }, [workerId]);

  const worker = data?.worker;
  const reviews = data?.reviews || [];
  const shownReviews = allReviews ? reviews : reviews.slice(0, 2);
  const schedule = worker?.work_schedule || {};
  const hasSchedule = DAYS.some(([key]) => schedule[key]?.from);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.sheetClose} onClick={onClose}>
          ✕
        </button>

        {!data && <div className={styles.loading}>Yuklanmoqda...</div>}
        {data?.error && <div className={styles.regError}>Profil yuklanmadi.</div>}

        {worker && (
          <>
            <div className={styles.sheetHead}>
              <div className={styles.workerName}>{worker.name}</div>
              <div className={styles.workerMeta}>
                ⭐ {worker.avg_rating.toFixed(1)} ({worker.total_reviews} ta baho) •{' '}
                {worker.is_busy ? 'Band' : 'Bo‘sh'}
              </div>
            </div>

            {worker.bio && <p className={styles.workerBio}>{worker.bio}</p>}

            <div className={styles.workerMeta}>
              📂 {worker.categories.map((c) => CATEGORY_LABEL[c] || c).join(', ')}
            </div>
            <div className={styles.workerMeta}>💼 Tajriba: {EXPERIENCE_LABEL[worker.experience_years] || '—'}</div>
            {worker.phone && <div className={styles.workerMeta}>📱 {worker.phone}</div>}

            {hasSchedule && (
              <div className={styles.sheetBlock}>
                <div className={styles.sheetBlockTitle}>🕐 Ish vaqti</div>
                {DAYS.map(([key, label]) => (
                  <div key={key} className={styles.scheduleRow}>
                    <span>{label}</span>
                    <span>{schedule[key]?.from ? `${schedule[key].from} - ${schedule[key].to}` : 'Dam olish'}</span>
                  </div>
                ))}
              </div>
            )}

            {Boolean(worker.portfolio_urls?.length) && (
              <div className={styles.sheetBlock}>
                <div className={styles.sheetBlockTitle}>🔗 Ishlarim</div>
                {worker.portfolio_urls.map((url) => (
                  <a key={url} className={styles.portfolioLink} href={url} target="_blank" rel="noreferrer noopener">
                    {url} ↗
                  </a>
                ))}
              </div>
            )}

            {Boolean(data.listings?.length) && (
              <div className={styles.sheetBlock}>
                <div className={styles.sheetBlockTitle}>📋 E&apos;lonlari</div>
                {data.listings.map((l) => (
                  <div key={l.id} className={styles.miniListing}>
                    <div className={styles.miniListingTitle}>{l.title}</div>
                    <div className={styles.miniListingDesc}>{l.description}</div>
                    <div className={styles.listingFoot}>
                      <span className={styles.listingPrice}>{money(l.min_price)} UZS dan</span>
                      <button
                        type="button"
                        className={styles.writeBtn}
                        disabled={starting}
                        onClick={() => startChat(l.id)}
                      >
                        Yozish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {Boolean(reviews.length) && (
              <div className={styles.sheetBlock}>
                <div className={styles.sheetBlockTitle}>⭐ Izohlar</div>
                {shownReviews.map((r, i) => (
                  <div key={i} className={styles.reviewCard}>
                    <div>{'⭐'.repeat(r.rating)}</div>
                    {r.comment && <div className={styles.reviewText}>{r.comment}</div>}
                  </div>
                ))}
                {reviews.length > 2 && !allReviews && (
                  <button type="button" className={styles.btnGhost} onClick={() => setAllReviews(true)}>
                    Batafsil
                  </button>
                )}
              </div>
            )}

            {chatError && <div className={styles.regError}>{chatError}</div>}
          </>
        )}
      </div>
    </div>
  );
}
