import { Outlet, useLocation } from 'react-router-dom';
import TabBar from './TabBar.jsx';
import styles from './Layout.module.css';

// Tab sahifalari uchun asosiy tuzilma: kontent maydoni + pastki TabBar.
// Yo'nalish o'zgarganda kontent yengil fade bilan almashadi (page transition).
export default function Layout() {
  const location = useLocation();
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <div key={location.pathname} className={styles.page}>
          <Outlet />
        </div>
      </main>
      <TabBar />
    </div>
  );
}
