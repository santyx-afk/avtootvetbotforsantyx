import PageHeader from '../../components/PageHeader.jsx';
import styles from './vacancy.module.css';

// Vakansiya profili — "ishchi bo'lish" kirish nuqtasi (skelet).
// Keyingi bosqichda: ishchi ro'yxatdan o'tishi, portfolio, statistika.
export default function VacancyProfile() {
  return (
    <div className={styles.page}>
      <PageHeader title="Profil" />

      <div className={styles.profileCard}>
        <span className={styles.profileEmoji}>💼</span>
        <div className={styles.profileTitle}>Ishchi bo'ling</div>
        <p className={styles.profileDesc}>
          Montaj yoki dizayn bo'yicha xizmat ko'rsating, buyurtma oling va daromad qiling.
        </p>
        <button type="button" className={styles.cta} disabled>
          Tez orada
        </button>
      </div>

      <p className={styles.note}>Ro'yxatdan o'tish keyingi bosqichda ochiladi.</p>
    </div>
  );
}
