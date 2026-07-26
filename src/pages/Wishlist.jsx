import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { SkeletonGrid } from '../components/Skeleton.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { useProductActions } from '../hooks/useProductActions.js';
import styles from './Wishlist.module.css';

export default function Wishlist() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { toggleWishlist, addToCart } = useProductActions();

  const [status, setStatus] = useState('loading');
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await apiCall('wishlist');
      setItems(res.items || []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = async (product) => {
    const prev = items;
    setItems((list) => list.filter((p) => p.id !== product.id)); // optimistik
    try {
      await toggleWishlist(product.id);
    } catch {
      setItems(prev);
    }
  };

  const handleAddToCart = (product) => {
    addToCart(product.id, 1).catch(() => {});
  };

  if (status === 'loading') {
    return (
      <>
        <PageHeader title={t('pages.wishlist.title')} />
        <div className="app-container">
          <SkeletonGrid count={4} />
        </div>
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader title={t('pages.wishlist.title')} />
        <ErrorState onRetry={load} />
      </>
    );
  }

  if (!items.length) {
    return (
      <>
        <PageHeader title={t('pages.wishlist.title')} />
        <EmptyState
          emoji="❤️"
          title={t('pages.wishlist.empty')}
          hint={t('pages.wishlist.emptyHint')}
          action={
            <button type="button" className={styles.browseBtn} onClick={() => navigate('/catalog')}>
              {t('checkout.backToCatalog')}
            </button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('pages.wishlist.title')} />
      <div className="app-container">
        <div className={styles.grid}>
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              inWishlist
              onToggleWishlist={handleRemove}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      </div>
    </>
  );
}
