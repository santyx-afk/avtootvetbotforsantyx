import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './ErrorState.module.css';

// Ma'lumot yuklanmaganda ko'rsatiladigan holat + "Qayta urinish" tugmasi.
export default function ErrorState({ title, text, onRetry }) {
  const { t } = useI18n();

  const handleRetry = () => {
    haptic.impact('light');
    onRetry?.();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.iconCircle}>
        <Icon name="alert" size={30} />
      </div>
      <h3 className={styles.title}>{title || t('errorState.title')}</h3>
      <p className={styles.text}>{text || t('errorState.text')}</p>
      {onRetry && (
        <button type="button" className={`${styles.btn} pressable`} onClick={handleRetry}>
          {t('errorState.retry')}
        </button>
      )}
    </div>
  );
}
