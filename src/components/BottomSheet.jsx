import { useEffect } from 'react';
import styles from './BottomSheet.module.css';

// Pastdan chiquvchi panel (native action sheet uslubida).
export default function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} />
        {title ? <div className={styles.title}>{title}</div> : null}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
