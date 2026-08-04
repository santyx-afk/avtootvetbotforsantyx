import PageHeader from '../../components/PageHeader.jsx';
import styles from './vacancy.module.css';

// Vakansiya chatlari ro'yxati (skelet).
export default function VacancyChats() {
  return (
    <div className={styles.page}>
      <PageHeader title="Chatlar" />
      <div className={styles.empty}>
        <span className={styles.emptyEmoji}>💬</span>
        <span className={styles.emptyTitle}>Hozircha suhbatlar yo'q</span>
        <span className={styles.emptyDesc}>
          Ishchi bilan bog'langaningizda suhbatlar shu yerda ko'rinadi.
        </span>
      </div>
    </div>
  );
}
