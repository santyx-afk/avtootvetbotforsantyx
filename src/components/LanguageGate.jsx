import BrandLogo from './BrandLogo.jsx';
import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './LanguageGate.module.css';

// Ilova birinchi marta ochilganda til so'raladi (onboarding'dan oldin, chunki
// onboarding matnlari ham tanlangan tilda chiqishi kerak).
//
// Bu ekran hali til tanlanmagan paytda chiziladi — shuning uchun sarlavha
// tarjimadan olinmaydi, uchala tilda birdan yozilgan. Har bir variant o'z
// tilida nomlanadi: odam o'zining tilini tanishi uchun shu yetarli.
const OPTIONS = [
  { code: 'uz', flag: '🇺🇿', name: 'O\'zbekcha' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'en', flag: '🇺🇸', name: 'English' },
];

const TITLES = ['Tilni tanlang', 'Выберите язык', 'Choose your language'];

export default function LanguageGate() {
  // Til tanlanishi bilan langChosen true bo'ladi va App bu ekranni almashtiradi.
  const { setLang } = useI18n();

  const choose = (code) => {
    haptic.impact('light');
    setLang(code);
  };

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <BrandLogo className={styles.logo} />
        <div className={styles.globe} aria-hidden="true">🌐</div>
        <div className={styles.titles}>
          {TITLES.map((title) => (
            <p key={title} className={styles.title}>
              {title}
            </p>
          ))}
        </div>
      </div>

      <ul className={styles.list}>
        {OPTIONS.map((opt) => (
          <li key={opt.code}>
            <button
              type="button"
              className={`${styles.item} pressable`}
              onClick={() => choose(opt.code)}
              lang={opt.code}
            >
              <span className={styles.flag} aria-hidden="true">{opt.flag}</span>
              <span className={styles.name}>{opt.name}</span>
              <span className={styles.chevron}>
                <Icon name="chevronRight" size={18} strokeWidth={2.4} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
