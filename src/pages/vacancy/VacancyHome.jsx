import { useCallback, useEffect, useState } from 'react';
import { vacancyCall } from '../../lib/vacancyApi.js';
import WorkerProfileSheet from './WorkerProfileSheet.jsx';
import styles from './vacancy.module.css';

const FILTERS = [
  { value: '', label: 'Hammasi' },
  { value: 'montaj', label: 'Montaj' },
  { value: 'dizayn', label: 'Dizayn' },
];

const SORTS = [
  { value: 'rating', label: 'Reyting' },
  { value: 'price_asc', label: 'Narx ↑' },
  { value: 'price_desc', label: 'Narx ↓' },
  { value: 'online', label: 'Online' },
];

const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

// E'lonlar katalogi — qidiruv, kategoriya filtri va saralash bilan.
export default function VacancyHome() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('rating');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openWorkerId, setOpenWorkerId] = useState(null);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const res = await vacancyCall('catalog', { search, category, sort }, { signal });
        setListings(res.listings || []);
      } catch (err) {
        if (err?.name !== 'AbortError') setListings([]);
      } finally {
        setLoading(false);
      }
    },
    [search, category, sort],
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
        placeholder="🔍 E'lon qidirish..."
      />

      <div className={styles.filterRow}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={category === f.value ? styles.chipActive : styles.chip}
            onClick={() => setCategory(f.value)}
          >
            {f.label}
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
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <div className={styles.loading}>Yuklanmoqda...</div>}

      {!loading && !listings.length && (
        <div className={styles.empty}>
          <span className={styles.emptyEmoji}>🔍</span>
          <div className={styles.emptyTitle}>E&apos;lon topilmadi</div>
          <p className={styles.emptyDesc}>Filtrlarni o&apos;zgartirib ko&apos;ring yoki keyinroq qayting.</p>
        </div>
      )}

      <div className={styles.listingGrid}>
        {listings.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.listingCard}
            onClick={() => setOpenWorkerId(item.worker.id)}
          >
            <div className={styles.listingTop}>
              <span className={styles.listingName}>{item.worker.name}</span>
              <span className={item.worker.is_busy ? styles.dotBusy : styles.dotFree} />
            </div>
            <div className={styles.listingMeta}>
              ⭐ {item.worker.avg_rating.toFixed(1)} • {CATEGORY_LABEL[item.category] || item.category}
            </div>
            <div className={styles.listingTitle}>{item.title}</div>
            <div className={styles.listingFoot}>
              <span className={styles.listingPrice}>{money(item.min_price)} UZS dan</span>
              <span className={styles.listingDone}>{item.worker.completed_orders} ish ✓</span>
            </div>
          </button>
        ))}
      </div>

      {openWorkerId && <WorkerProfileSheet workerId={openWorkerId} onClose={() => setOpenWorkerId(null)} />}
    </div>
  );
}
