import styles from './EmptyState.module.css';

// Bo'sh holat: emoji/ikonka + sarlavha + izoh + ixtiyoriy aksiya tugmasi.
export default function EmptyState({ emoji = '📭', title, hint, action }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.emoji}>{emoji}</div>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
