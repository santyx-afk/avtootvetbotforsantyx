import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import Banner from '../components/Banner.jsx';
import SearchBar from '../components/SearchBar.jsx';
import ProductCard from '../components/ProductCard.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { readCache, writeCache } from '../lib/cache.js';
import { useProductActions } from '../hooks/useProductActions.js';
import { getRecentlyViewed } from '../utils/storage.js';
import { haptic } from '../telegram/webapp.js';
import styles from './Catalog.module.css';

const SORTS = ['default', 'price_asc', 'price_desc', 'popular'];

// Bir sahifada ko'rsatiladigan mahsulotlar soni — qolgani "Yana ko'rsatish" bilan ochiladi.
const PAGE_SIZE = 24;

// Qidiruv nom, tavsif va teglar bo'yicha ishlaydi (oldin faqat nom edi).
function matchesQuery(product, q) {
  if (product.name.toLowerCase().includes(q)) return true;
  if ((product.description || '').toLowerCase().includes(q)) return true;
  const tags = Array.isArray(product.tags) ? product.tags : [];
  return tags.some((tag) => String(tag).toLowerCase().includes(q));
}

function sortProducts(list, sort) {
  const arr = [...list];
  if (sort === 'price_asc') arr.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') arr.sort((a, b) => b.price - a.price);
  else if (sort === 'popular')
    arr.sort(
      (a, b) =>
        Number(b.is_popular) - Number(a.is_popular) ||
        (b.rating?.avg || 0) - (a.rating?.avg || 0),
    );
  return arr;
}

export default function Catalog() {
  const { t } = useI18n();
  const { toggleWishlist, addToCart } = useProductActions();

  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [wishlist, setWishlist] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');
  const [selectedCat, setSelectedCat] = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Filtr konteksti o'zgarganda sahifalash boshidan boshlanadi
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, selectedCat, sort]);

  const load = useCallback(async () => {
    // Cache bo'lsa — darhol ko'rsatamiz (spinnersiz), keyin fonda yangilaymiz.
    const cached = readCache('catalog');
    if (cached) {
      setData(cached);
      setWishlist(new Set(cached.wishlist || []));
      setStatus('ready');
    } else {
      setStatus('loading');
    }
    try {
      const res = await apiCall('catalog');
      setData(res);
      setWishlist(new Set(res.wishlist || []));
      setStatus('ready');
      writeCache('catalog', res);
    } catch {
      // Cache bor bo'lsa eski ma'lumot qoladi, xato ko'rsatmaymiz.
      if (!cached) setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const products = data?.products || [];
  const productsById = useMemo(() => {
    const m = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  // Kategoriyalar — faqat mahsuloti borlari
  const categoriesWithProducts = useMemo(() => {
    const cats = data?.categories || [];
    const usedIds = new Set(products.map((p) => p.category_id));
    return cats.filter((c) => usedIds.has(c.id));
  }, [data, products]);

  const handleWishlist = async (product) => {
    haptic.impact('light');
    const next = new Set(wishlist);
    const has = next.has(product.id);
    if (has) next.delete(product.id);
    else next.add(product.id);
    setWishlist(next); // optimistik
    try {
      await toggleWishlist(product.id);
    } catch {
      setWishlist(wishlist); // qaytarish
    }
  };

  const handleAddToCart = (product) => {
    addToCart(product.id, 1).catch(() => {});
  };

  if (status === 'loading') {
    return (
      <>
        <PageHeader title={t('pages.catalog.title')} />
        <div className="app-container">
          <SkeletonGrid count={6} />
        </div>
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader title={t('pages.catalog.title')} />
        <ErrorState onRetry={load} />
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? products.filter((p) => matchesQuery(p, q)) : products;

  const recentIds = getRecentlyViewed();
  const recentProducts = recentIds.map((id) => productsById[id]).filter(Boolean);
  // "Hammasi" rejimi: qidiruv yo'q va kategoriya tanlanmagan
  const showAllMode = !q && selectedCat === 'all';
  const selectedCatName = categoriesWithProducts.find((c) => c.id === selectedCat)?.name || '';

  // Ko'rsatiladigan mahsulotlar (kategoriya bo'yicha filtrlangan) — keyin saralanadi
  const visibleProducts =
    q || selectedCat === 'all'
      ? filtered
      : filtered.filter((p) => p.category_id === selectedCat);
  const sortedProducts = sortProducts(visibleProducts, sort);

  const renderCard = (p) => (
    <ProductCard
      key={p.id}
      product={p}
      inWishlist={wishlist.has(p.id)}
      onToggleWishlist={handleWishlist}
      onAddToCart={handleAddToCart}
    />
  );

  return (
    <>
      <PageHeader title={t('pages.catalog.title')} />

      <Banner banners={data?.banners || []} />

      <SearchBar
        value={query}
        onChange={setQuery}
        onSortClick={() => setSheetOpen(true)}
        sortActive={sort !== 'default'}
      />

      {/* Kategoriya filtri (chips) */}
      {!q && categoriesWithProducts.length > 1 && (
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${selectedCat === 'all' ? styles.chipOn : ''}`}
            onClick={() => setSelectedCat('all')}
          >
            {t('catalog.all')}
          </button>
          {categoriesWithProducts.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.chip} ${selectedCat === c.id ? styles.chipOn : ''}`}
              onClick={() => setSelectedCat(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          emoji={q ? '🔍' : '🛍️'}
          title={q ? t('catalog.noResults') : t('pages.catalog.empty')}
        />
      ) : (
        <div className="app-container">
          {/* Oxirgi ko'rilganlar — faqat "Hammasi" rejimida */}
          {showAllMode && recentProducts.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('catalog.recentlyViewed')}</h2>
              <div className={styles.hScroll}>
                {recentProducts.map((p) => (
                  <div key={p.id} className={styles.hItem}>
                    {renderCard(p)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Kategoriya nomi — faqat alohida kategoriya tanlanganda */}
          {!showAllMode && !q && selectedCatName && (
            <h2 className={styles.sectionTitle}>{selectedCatName}</h2>
          )}

          {/* Yagona tekis grid — saralash butun ro'yxatga qo'llanadi */}
          <div className={styles.grid}>{sortedProducts.slice(0, visibleCount).map(renderCard)}</div>

          {sortedProducts.length > visibleCount && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              {t('catalog.showMore')} ({sortedProducts.length - visibleCount})
            </button>
          )}
        </div>
      )}

      {/* Saralash paneli */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('catalog.sort')}>
        {SORTS.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.sortOption}
            onClick={() => {
              setSort(s);
              setSheetOpen(false);
            }}
          >
            <span>
              {t(
                s === 'default'
                  ? 'catalog.sortDefault'
                  : s === 'price_asc'
                    ? 'catalog.sortPriceAsc'
                    : s === 'price_desc'
                      ? 'catalog.sortPriceDesc'
                      : 'catalog.sortPopular',
              )}
            </span>
            {sort === s && <Icon name="check" size={20} strokeWidth={2.4} />}
          </button>
        ))}
      </BottomSheet>
    </>
  );
}
