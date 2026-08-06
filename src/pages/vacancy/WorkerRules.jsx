import { useState } from 'react';
import styles from './vacancy.module.css';

const RULES = [
  'Yakuniy to’lovni so’rashdan oldin mijozdan natija qabul qilinganini tasdiqlang',
  'Deadline ga rioya qiling. 3 marta buzilsa — vaqtincha ban',
  'Mijoz bilan hurmatli munosabatda bo’ling',
  'So’kinish, haqoratga yo’l qo’yilmaydi',
  'Sifatsiz ish topshirsangiz shtraf yoki ban olishingiz mumkin',
];

// Tasdiqlangan ishchi birinchi marta profilga kirganda ko'rsatiladigan qoidalar modali.
export default function WorkerRules({ onAccept }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>📋 Ishchi qoidalari</h2>
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
