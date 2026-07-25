import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './TabBar.module.css';

const TABS = [
  { to: '/catalog', icon: 'catalog', key: 'catalog' },
  { to: '/cart', icon: 'cart', key: 'cart' },
  { to: '/wishlist', icon: 'wishlist', key: 'wishlist' },
  { to: '/history', icon: 'history', key: 'history' },
  { to: '/profile', icon: 'profile', key: 'profile' },
];

export default function TabBar() {
  const { t } = useI18n();

  return (
    <nav className={styles.tabbar}>
      <div className={styles.inner}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => haptic.selection()}
          >
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} size={24} filled={isActive && tab.icon === 'wishlist'} />
                <span className={styles.label}>{t(`tabs.${tab.key}`)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
