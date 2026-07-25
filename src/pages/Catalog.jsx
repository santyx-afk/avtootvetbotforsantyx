import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

// Faza 1: skeleton. Katalog ro'yxati Faza 2 da to'ldiriladi.
export default function Catalog() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('pages.catalog.title')} />
      <EmptyState emoji="🛍️" title={t('pages.catalog.empty')} hint={t('common.comingSoon')} />
    </>
  );
}
