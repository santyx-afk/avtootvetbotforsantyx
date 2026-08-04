import styles from './vacancy.module.css';

// Vakansiya rejimining bosh sahifasi (skelet).
// Keyingi bosqichlarda: e'lonlar katalogi, qidiruv, ishchi kartalari qo'shiladi.
export default function VacancyHome() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Vakansiyalar</h1>
        <p className={styles.heroSub}>
          Video montaj va dizayn xizmatlari. Ishchi toping yoki o'zingiz ish oling.
        </p>
      </div>

      <div className={styles.cats}>
        <div className={styles.cat}>
          <span className={styles.catEmoji}>🎬</span>
          <span className={styles.catName}>Video montaj</span>
          <span className={styles.catDesc}>Reels, YouTube, reklama roliklari</span>
        </div>
        <div className={styles.cat}>
          <span className={styles.catEmoji}>🎨</span>
          <span className={styles.catName}>Dizayn</span>
          <span className={styles.catDesc}>Logo, banner, SMM postlar</span>
        </div>
      </div>

      <div className={styles.soon}>
        <span className={styles.soonEmoji}>🚧</span>
        <span className={styles.soonText}>
          Bo'lim tayyorlanmoqda. Tez orada e'lonlar, chat va xavfsiz to'lov tizimi ishga tushadi.
        </span>
      </div>
    </div>
  );
}
