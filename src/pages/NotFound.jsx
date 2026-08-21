import { Link } from 'react-router-dom';
import usePageMeta from '../hooks/usePageMeta.js';
import styles from './NotFound.module.css';

// Mavjud bo'lmagan manzil uchun sahifa.
// Ilgari istalgan noto'g'ri manzilda Landing ko'rsatilardi va server 200 OK
// qaytarardi — qidiruv tizimlari buni "soft 404" deb hisoblab, bir xil
// mazmunli cheksiz nusxalarni indekslashi mumkin edi. Endi bu sahifa
// noindex bilan belgilanadi.
export default function NotFound() {
  usePageMeta({
    title: 'Sahifa topilmadi — santyx',
    description: 'Bunday manzil mavjud emas.',
    path: '/404',
    noindex: true,
  });

  return (
    <div className={styles.page}>
      <div className={styles.code}>404</div>
      <h1 className={styles.title}>Bunday sahifa yo&apos;q</h1>
      <p className={styles.text}>
        Manzil noto&apos;g&apos;ri yozilgan yoki sahifa ko&apos;chirilgan bo&apos;lishi mumkin.
      </p>
      <Link className={styles.cta} to="/">
        Bosh sahifaga qaytish
      </Link>
    </div>
  );
}
