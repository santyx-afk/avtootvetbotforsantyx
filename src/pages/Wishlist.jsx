import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

// Faza 1: skeleton. Wishlist Faza 5 da to'ldiriladi.
export default function Wishlist() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('pages.wishlist.title')} />
      <EmptyState emoji="❤️" title={t('pages.wishlist.empty')} hint={t('pages.wishlist.emptyHint')} />
    </>
  );
}
