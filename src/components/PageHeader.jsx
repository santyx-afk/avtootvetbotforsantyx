import styles from './PageHeader.module.css';

// Sahifa sarlavhasi (katta, native iOS uslubidagi).
// Ixtiyoriy o'ng tomon aksiyasi (action) bilan.
export default function PageHeader({ title, subtitle, action }) {
  return (
    <header className={styles.header}>
      <div className={styles.row}>
        <h1 className={styles.title}>{title}</h1>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}
