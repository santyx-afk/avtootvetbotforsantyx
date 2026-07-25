import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

// Faza 1: skeleton. Savat va checkout Faza 3 da to'ldiriladi.
export default function Cart() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('pages.cart.title')} />
      <EmptyState emoji="🛒" title={t('pages.cart.empty')} hint={t('pages.cart.emptyHint')} />
    </>
  );
}
