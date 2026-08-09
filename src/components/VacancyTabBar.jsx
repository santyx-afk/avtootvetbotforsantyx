import { NavLink, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './VacancyTabBar.module.css';

// Vakansiya (super-app) rejimi uchun pastki navigatsiya.
// Birinchi tugma — obuna do'koniga qaytaradi; qolganlari vakansiya bo'limlari.
// Yorliqlar do'kon menyusi bilan bir xil i18n manbaidan olinadi — ilgari ular
// o'zbekcha hardcode qilingani uchun ruscha interfeysda menyu tili o'zgarib ketardi.
const TABS = [
  { to: '/vacancy', icon: 'briefcase', key: 'home', end: true },
  { to: '/vacancy/listings', icon: 'clipboard', key: 'listings' },
  { to: '/vacancy/profile', icon: 'profile', key: 'profile' },
];

export default function VacancyTabBar() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const exitToStore = () => {
    haptic.selection();
    navigate('/catalog');
  };

  return (
    <nav className={styles.tabbar}>
      <div className={styles.inner}>
        <button type="button" className={`${styles.tab} ${styles.exit}`} onClick={exitToStore}>
          <span className={styles.iconWrap}>
            <Icon name="chevronLeft" size={20} />
          </span>
          <span className={styles.label}>{t('vacancyTabs.store')}</span>
        </button>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => haptic.selection()}
          >
            <span className={styles.iconWrap}>
              <Icon name={tab.icon} size={24} />
            </span>
            <span className={styles.label}>{t(`vacancyTabs.${tab.key}`)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
