import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../../components/Spinner.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import WorkerProfileSheet from './WorkerProfileSheet.jsx';
import styles from './vacancy.module.css';

const FILTERS = [
  { value: '', label: 'Hammasi' },
  { value: 'montaj', label: 'Montaj' },
  { value: 'dizayn', label: 'Dizayn' },
];

// Saralash — bir vaqtda bittasi. "Online" bu ro'yxatda emas: u mustaqil filtr
// bo'lib, istalgan saralash bilan birga ishlaydi.
const SORTS = [
  { value: 'rating', label: 'Reyting' },
  { value: 'price_asc', label: 'Narx ↑' },
  { value: 'price_desc', label: 'Narx ↓' },
];

const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

// E'lonlar katalogi — qidiruv, kategoriya filtri, saralash va "Online" filtri.
export default function VacancyHome() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('rating');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openWorkerId, setOpenWorkerId] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const res = await vacancyCall(
          'catalog',
          { search, category, sort, only_online: onlyOnline },
          { signal },
        );
        setListings(res.listings || []);
      } catch (err) {
        if (err?.name !== 'AbortError') setListings([]);
      } finally {
        // Bekor qilingan so'rovda loading'ni o'chirmaymiz — o'rniga yangisi ketmoqda.
        if (!signal?.aborted) setLoading(false);
      }
    },
    [search, category, sort, onlyOnline],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), search ? 350 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, search]);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Vakansiyalar</h1>
        <p className={styles.heroSub}>Video montaj va dizayn xizmatlari.</p>
      </div>

      <input
        className={styles.input}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="E'lon qidirish"
      />

      <div className={styles.filterRow}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={category === f.value ? styles.chipActive : styles.chip}
            onClick={() => setCategory(f.value)}
            disabled={loading}
          >
            {f.label}
            {loading && category === f.value && <Spinner size={12} stroke={2} className={styles.btnSpinner} />}
          </button>
        ))}
      </div>

      <div className={styles.filterRow}>
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            className={sort === s.value ? styles.sortActive : styles.sort}
            onClick={() => setSort(s.value)}
            disabled={loading}
          >
            {s.label}
            {loading && sort === s.value && <Spinner size={12} stroke={2} className={styles.btnSpinner} />}
          </button>
        ))}

        {/* Mustaqil filtr — saralash bilan birga ishlaydi, uni bekor qilmaydi */}
        <button
          type="button"
          className={onlyOnline ? styles.sortActive : styles.sort}
          onClick={() => setOnlyOnline((v) => !v)}
          disabled={loading}
          aria-pressed={onlyOnline}
        >
          {onlyOnline ? '✓ ' : ''}Online
          {loading && onlyOnline && <Spinner size={12} stroke={2} className={styles.btnSpinner} />}
        </button>
      </div>

      {loading && <div className={styles.loading}>Yuklanmoqda...</div>}

      {!loading && !listings.length && (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>E&apos;lon topilmadi</div>
          <p className={styles.emptyDesc}>Filtrlarni o&apos;zgartirib ko&apos;ring yoki keyinroq qayting.</p>
        </div>
      )}

      <div className={styles.listingGrid}>
        {listings.map((item) => (
          <div
            key={item.id}
            className={styles.listingCard}
            role="button"
            tabIndex={0}
            onClick={() => setOpenWorkerId(item.worker.id)}
            onKeyDown={(e) => e.key === 'Enter' && setOpenWorkerId(item.worker.id)}
          >
            <div className={styles.listingTop}>
              <span className={styles.listingName}>{item.worker.name}</span>
              <span className={item.worker.is_busy ? styles.dotBusy : styles.dotFree} />
            </div>
            <div className={styles.listingMeta}>
              ★ {item.worker.avg_rating.toFixed(1)} • {CATEGORY_LABEL[item.category] || item.category}
            </div>
            <div className={styles.listingTitle}>{item.title}</div>
            <div className={styles.listingFoot}>
              <span className={styles.listingPrice}>{money(item.min_price)} UZS dan</span>
              <span className={styles.listingDone}>{item.worker.completed_orders} ish ✓</span>
            </div>
          </div>
        ))}
      </div>

      {openWorkerId && (
        <WorkerProfileSheet
          workerId={openWorkerId}
          onClose={() => setOpenWorkerId(null)}
          onOpenChat={(chatId) => navigate('/vacancy/chats', { state: { openChat: chatId } })}
        />
      )}
    </div>
  );
}
