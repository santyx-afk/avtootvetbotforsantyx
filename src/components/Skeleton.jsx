import styles from './Skeleton.module.css';

// Umumiy skeleton bloki. width/height/radius props orqali sozlanadi.
export default function Skeleton({ width = '100%', height = 16, radius = 8, style, className }) {
  return (
    <span
      className={`${styles.skeleton} ${className || ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

// Bir nechta matn qatorlari uchun preset.
export function SkeletonText({ lines = 3, gap = 8 }) {
  return (
    <span className={styles.textBlock} style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </span>
  );
}

// Mahsulot kartochkasi shakli (katalog uchun keyingi fazalarda ishlatiladi).
export function SkeletonCard() {
  return (
    <div className={styles.card}>
      <Skeleton height={110} radius={12} />
      <div className={styles.cardBody}>
        <Skeleton height={14} width="80%" />
        <Skeleton height={12} width="50%" />
        <Skeleton height={20} width="40%" radius={10} />
      </div>
    </div>
  );
}

// Katalog grid skeletoni.
export function SkeletonGrid({ count = 6 }) {
  return (
    <div className={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
