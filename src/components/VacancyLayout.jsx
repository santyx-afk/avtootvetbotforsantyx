import { Outlet, useLocation } from 'react-router-dom';
import VacancyTabBar from './VacancyTabBar.jsx';
import styles from './Layout.module.css';

// Vakansiya (super-app) rejimining asosiy tuzilmasi: kontent + vakansiya TabBar.
// Do'kon rejimidan mustaqil — o'z navigatsiyasiga ega.
export default function VacancyLayout() {
  const location = useLocation();
  return (
    <div className={styles.shell} data-mode="vacancy">
      <main className={styles.content}>
        <div key={location.pathname} className={styles.page}>
          <Outlet />
        </div>
      </main>
      <VacancyTabBar />
    </div>
  );
}
