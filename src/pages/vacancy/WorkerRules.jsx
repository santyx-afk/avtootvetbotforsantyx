import { useState } from 'react';
import styles from './vacancy.module.css';

// Xizmat bepul: platforma faqat e'lon joylash uchun. Shartnoma, to'lov va
// muddat masalalari ishchi bilan mijoz o'rtasida bevosita hal qilinadi.
const RULES = [
  'E’londa faqat o’zingiz bajaradigan xizmatlarni ko’rsating',
  'Narx va shartlarni aniq yozing — mijoz siz bilan bevosita bog’lanadi',
  'Bog’lanish ma’lumotlaringiz (telefon yoki havola) ishlayotgan bo’lsin',
  'Mijoz bilan hurmatli munosabatda bo’ling',
  'So’kinish, haqorat va yolg’on ma’lumotga yo’l qo’yilmaydi',
  'Qoida buzilsa e’lon o’chiriladi yoki hisob to’xtatiladi',
];

// Tasdiqlangan ishchi birinchi marta profilga kirganda ko'rsatiladigan qoidalar modali.
export default function WorkerRules({ onAccept }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>Ishchi qoidalari</h2>
        <ol className={styles.rulesList}>
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>Qoidalarni o&apos;qidim va roziman</span>
        </label>
        <button type="button" className={styles.btnPrimary} disabled={!agreed} onClick={onAccept}>
          Davom etish
        </button>
      </div>
    </div>
  );
}
