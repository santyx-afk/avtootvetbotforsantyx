import { NavLink, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './VacancyTabBar.module.css';

// Vakansiya (super-app) rejimi uchun pastki navigatsiya.
// Birinchi tugma — obuna do'koniga qaytaradi; qolganlari vakansiya bo'limlari.
const TABS = [
  { to: '/vacancy', icon: 'briefcase', label: 'Bosh sahifa', end: true },
  { to: '/vacancy/chats', icon: 'chat', label: 'Chatlar' },
  { to: '/vacancy/orders', icon: 'clipboard', label: 'Orderlar' },
  { to: '/vacancy/profile', icon: 'profile', label: 'Profil' },
];

export default function VacancyTabBar() {
  const navigate = useNavigate();

  const exitToStore = () => {
    haptic.selection();
    navigate('/catalog');
  };

  return (
    <nav className={styles.tabbar}>
      <div className={styles.inner}>
        <button type="button" className={`${styles.tab} ${styles.exit}`} onClick={exitToStore}>
          <span className={styles.iconWrap}>
            <Icon name="chevronLeft" size={24} />
          </span>
          <span className={styles.label}>Do'kon</span>
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
            <span className={styles.label}>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
