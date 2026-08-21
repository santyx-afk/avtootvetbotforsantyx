import { useCallback, useEffect, useState } from 'react';
import useModalDismiss from '../../hooks/useModalDismiss.js';
import { vacancyCall } from '../../lib/vacancyApi.js';
import { openLink, openTelegramLink, haptic } from '../../telegram/webapp.js';
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

// Telegram WebView'da `tel:` havolasi ochilmasligi mumkin — shuning uchun raqam
// yonida nusxalash tugmasi ham bor.
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* pastdagi zaxira usul */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

// Ishchining ochiq profili — e'lonlari, ish vaqti, bog'lanish va portfolio.
// Mijoz e'lon egasi bilan to'g'ridan-to'g'ri bog'lanadi: "Bog'lanish" tugmasi
// uning Telegram profilini (username orqali) ochadi, telefon esa
// ishchi ruxsat berganda ko'rinadi. Portfolio havolalari alohida bo'limda.
// `highlightListingId` — katalogda bosilgan e'lon, ro'yxatda ajratib ko'rsatiladi.
export default function WorkerProfileSheet({ workerId, highlightListingId, onClose }) {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null);
    vacancyCall('worker-public', { worker_id: workerId })
      .then((res) => alive && setData(res))
      .catch(() => alive && setData({ error: true }));
    return () => {
      alive = false;
    };
  }, [workerId, reloadKey]);

  // Escape / Telegram "ortga" yopadi, fon aylanmaydi.
  useModalDismiss(onClose);

  const onCopyPhone = useCallback(async (phone) => {
    if (await copyText(phone)) {
      haptic.notification('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, []);

  const worker = data?.worker;
  const schedule = worker?.work_schedule || {};
  const hasSchedule = DAYS.some(([key]) => schedule[key]?.from);
  const categories = worker?.categories || [];

  // "Bog'lanish" — e'lon egasining Telegram profilini t.me havolasi orqali ochadi.
  //
  // Ilgari username bo'lmaganda `tg://user?id=` zaxira yo'li ishlatilardi, lekin
  // Telegram uni faqat ayrim holatlarda ochadi: ko'p qurilmada tugma bosilganda
  // hech nima bo'lmasdi. Endi username yo'q bo'lsa tugma umuman ko'rsatilmaydi
  // — uning o'rniga telefon yoki tushuntirish matni chiqadi.
  const telegramUsername = worker?.telegram_username
    ? String(worker.telegram_username).replace(/^@/, '')
    : null;

  const openWorkerTelegram = useCallback(() => {
    if (!telegramUsername) return;
    haptic.impact('light');
    openTelegramLink(`https://t.me/${telegramUsername}`);
  }, [telegramUsername]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={worker?.name || 'Ishchi profili'}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Yopish">
          ✕
        </button>

        {!data && <div className={styles.loading}>Yuklanmoqda...</div>}

        {data?.error && (
          <>
            <div className={styles.regError}>Profil yuklanmadi.</div>
            <button type="button" className={styles.btnGhost} onClick={() => setReloadKey((k) => k + 1)}>
              Qayta urinish
            </button>
          </>
        )}

        {worker && (
          <>
            <div className={styles.sheetHead}>
              <div className={styles.workerName}>{worker.name}</div>
              {/* Baho tizimi olib tashlangan — bu yerda ishchining holati ko'rsatiladi. */}
              <div className={styles.workerMeta}>
                {categories.map((c) => CATEGORY_LABEL[c] || c).join(', ') || '—'}
                {' • '}
                {worker.is_busy ? 'Band' : 'Bo‘sh'}
              </div>
            </div>

            {worker.bio && <p className={styles.workerBio}>{worker.bio}</p>}

            <div className={styles.workerMeta}>
              Tajriba: {EXPERIENCE_LABEL[worker.experience_years] || '—'}
            </div>

            {/* Xizmat bepul: mijoz e'lon egasi bilan to'g'ridan-to'g'ri bog'lanadi */}
            <div className={styles.sheetBlock}>
              <div className={styles.sheetBlockTitle}>Bog&apos;lanish</div>
              {telegramUsername && (
                <button type="button" className={styles.btnPrimary} onClick={openWorkerTelegram}>
                  Telegram orqali bog&apos;lanish
                </button>
              )}
              {worker.phone ? (
                <div className={styles.contactRow}>
                  <a className={styles.contactLink} href={`tel:${worker.phone.replace(/\s/g, '')}`}>
                    {worker.phone}
                  </a>
                  <button
                    type="button"
                    className={styles.btnCopy}
                    onClick={() => onCopyPhone(worker.phone.replace(/\s/g, ''))}
                  >
                    {copied ? 'Nusxalandi' : 'Nusxalash'}
                  </button>
                </div>
              ) : null}
              {!telegramUsername && !worker.phone && (
                <p className={styles.miniListingDesc}>
                  Ishchi bog&apos;lanish ma&apos;lumotini ko&apos;rsatmagan. Uning e&apos;loni ostidagi
                  portfolio havolalari orqali urinib ko&apos;ring.
                </p>
              )}
            </div>

            {/* Portfolio havolalari — bog'lanishdan alohida bo'lim */}
            {Boolean(worker.portfolio_urls?.length) && (
              <div className={styles.sheetBlock}>
                <div className={styles.sheetBlockTitle}>Portfolio</div>
                {worker.portfolio_urls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    className={styles.contactLink}
                    onClick={() => openLink(url)}
                  >
                    {url}
                  </button>
                ))}
              </div>
            )}

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
                  <div
                    key={l.id}
                    className={l.id === highlightListingId ? styles.miniListingActive : styles.miniListing}
                  >
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
