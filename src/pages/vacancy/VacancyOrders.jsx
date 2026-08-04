import PageHeader from '../../components/PageHeader.jsx';
import styles from './vacancy.module.css';

// Vakansiya buyurtmalari ro'yxati (skelet).
export default function VacancyOrders() {
  return (
    <div className={styles.page}>
      <PageHeader title="Orderlar" />
      <div className={styles.empty}>
        <span className={styles.emptyEmoji}>📋</span>
        <span className={styles.emptyTitle}>Hozircha buyurtmalar yo'q</span>
        <span className={styles.emptyDesc}>
          Ishchiga buyurtma berganingizdan so'ng, jarayoni shu yerda kuzatiladi.
        </span>
      </div>
    </div>
  );
}
