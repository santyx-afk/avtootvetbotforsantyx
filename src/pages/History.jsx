import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

// Faza 1: skeleton. Buyurtmalar tarixi Faza 5 da to'ldiriladi.
export default function History() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('pages.history.title')} />
      <EmptyState emoji="🧾" title={t('pages.history.empty')} hint={t('common.comingSoon')} />
    </>
  );
}
