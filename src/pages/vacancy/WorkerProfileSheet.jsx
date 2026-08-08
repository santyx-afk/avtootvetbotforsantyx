import { useEffect, useState } from 'react';
import { vacancyCall } from '../../lib/vacancyApi.js';
import styles from './vacancy.module.css';

const EXPERIENCE_LABEL = { 0: '1 yildan kam', 1: '1-2 yil', 2: '2-5 yil', 5: '5+ yil' };
const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };
const DAYS = [
  ['mon', 'Du'], ['tue', 'Se'], ['wed', 'Cho'], ['thu', 'Pa'],
  ['fri', 'Ju'], ['sat', 'Sha'], ['sun', 'Ya'],
];

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

// Ishchining ochiq profili — e'lonlari, ish vaqti va bog'lanish ma'lumotlari.
// Mijoz ishchi bilan to'g'ridan-to'g'ri (telefon yoki havola orqali) bog'lanadi.
export default function WorkerProfileSheet({ workerId, onClose }) {
  const [data, setData] = useState(null);

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
  const schedule = worker?.work_schedule || {};
  const hasSchedule = DAYS.some(([key]) => schedule[key]?.from);
  // Bog'lanish: telefon (agar ishchi ko'rsatishga ruxsat bergan bo'lsa) yoki havolalar.
  const hasContact = Boolean(worker?.phone) || Boolean(worker?.portfolio_urls?.length);

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
                ★ {worker.avg_rating.toFixed(1)} ({worker.total_reviews} ta baho) •{' '}
                {worker.is_busy ? 'Band' : 'Bo‘sh'}
              </div>
            </div>

            {worker.bio && <p className={styles.workerBio}>{worker.bio}</p>}

            <div className={styles.workerMeta}>
              {worker.categories.map((c) => CATEGORY_LABEL[c] || c).join(', ')}
            </div>
            <div className={styles.workerMeta}>Tajriba: {EXPERIENCE_LABEL[worker.experience_years] || '—'}</div>

            {/* Xizmat bepul: mijoz ishchi bilan to'g'ridan-to'g'ri bog'lanadi */}
            <div className={styles.sheetBlock}>
              <div className={styles.sheetBlockTitle}>Bog&apos;lanish</div>
              {worker.phone ? (
                <a className={styles.contactLink} href={`tel:${worker.phone.replace(/\s/g, '')}`}>
                  {worker.phone}
                </a>
              ) : null}
              {worker.portfolio_urls?.map((url) => (
                <a key={url} className={styles.contactLink} href={url} target="_blank" rel="noreferrer noopener">
                  {url}
                </a>
              ))}
              {!hasContact && (
                <p className={styles.miniListingDesc}>
                  Ishchi bog&apos;lanish ma&apos;lumotini ko&apos;rsatmagan.
                </p>
              )}
            </div>

            {hasSchedule && (
              <div className={styles.sheetBlock}>
                <div className={styles.sheetBlockTitle}>Ish vaqti</div>
                {DAYS.map(([key, label]) => (
                  <div key={key} className={styles.scheduleRow}>
                    <span>{label}</span>
                    <span>{schedule[key]?.from ? `${schedule[key].from} - ${schedule[key].to}` : 'Dam olish'}</span>
                  </div>
                ))}
              </div>
            )}

            {Boolean(data.listings?.length) && (
              <div className={styles.sheetBlock}>
                <div className={styles.sheetBlockTitle}>E&apos;lonlari</div>
                {data.listings.map((l) => (
                  <div key={l.id} className={styles.miniListing}>
                    <div className={styles.miniListingTitle}>{l.title}</div>
                    <div className={styles.miniListingDesc}>{l.description}</div>
                    <div className={styles.listingFoot}>
                      <span className={styles.listingPrice}>{money(l.min_price)} UZS dan</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
