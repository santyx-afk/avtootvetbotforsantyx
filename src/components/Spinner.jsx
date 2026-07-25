import styles from './Spinner.module.css';

// Aylanuvchi yuklash indikatori.
export default function Spinner({ size = 24, stroke = 2.5, className }) {
  return (
    <span
      className={`${styles.spinner} ${className || ''}`}
      style={{ width: size, height: size, borderWidth: stroke }}
    />
  );
}

// Butun ekranli boshlang'ich yuklash.
export function FullScreenLoader() {
  return (
    <div className={styles.full}>
      <Spinner size={30} />
    </div>
  );
}
