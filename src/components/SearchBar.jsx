import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import styles from './SearchBar.module.css';

// Qidiruv maydoni + saralash tugmasi.
export default function SearchBar({ value, onChange, onSortClick, sortActive }) {
  const { t } = useI18n();
  return (
    <div className={styles.row}>
      <div className={styles.field}>
        <Icon name="search" size={18} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.input}
          placeholder={t('catalog.searchPlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value ? (
          <button type="button" className={styles.clear} onClick={() => onChange('')} aria-label="clear">
            <Icon name="close" size={16} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className={`${styles.sortBtn} ${sortActive ? styles.sortActive : ''}`}
        onClick={onSortClick}
        aria-label={t('catalog.sort')}
      >
        <Icon name="sort" size={20} />
      </button>
    </div>
  );
}
