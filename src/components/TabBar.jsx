import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useCart } from '../lib/CartProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './TabBar.module.css';

const TABS = [
  { to: '/catalog', icon: 'catalog', key: 'catalog' },
  { to: '/cart', icon: 'cart', key: 'cart' },
  { to: '/wishlist', icon: 'wishlist', key: 'wishlist' },
  { to: '/history', icon: 'history', key: 'history' },
  { to: '/vacancy', icon: 'briefcase', key: 'vacancies' }, // vakansiya (super-app) rejimiga kirish
  { to: '/profile', icon: 'profile', key: 'profile' },
];

export default function TabBar() {
  const { t } = useI18n();
  const { count } = useCart();

  return (
    <nav className={styles.tabbar} data-tabbar>
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
                <span className={styles.iconWrap}>
                  <Icon name={tab.icon} size={24} filled={isActive && tab.icon === 'wishlist'} />
                  {tab.key === 'cart' && count > 0 && (
                    <span className={styles.badge}>{count > 9 ? '9+' : count}</span>
                  )}
                </span>
                <span className={styles.label}>{t(`tabs.${tab.key}`)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
