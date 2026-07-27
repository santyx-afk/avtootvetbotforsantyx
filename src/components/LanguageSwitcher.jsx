import { useI18n } from '../i18n/I18nProvider.jsx';
import { SUPPORTED_LANGS } from '../i18n/index.js';
import { haptic } from '../telegram/webapp.js';
import Icon from './Icon.jsx';
import styles from './LanguageSwitcher.module.css';

// Inglizcha uchun bayroq emoji (🇬🇧) ba'zi qurilmalarda "GB" bo'lib ko'rinadi —
// shuning uchun "EN" matn kodi ishlatiladi.
const FLAGS = { uz: '🇺🇿', ru: '🇷🇺', en: 'EN' };

// Til tanlash ro'yxati (Profil / Sozlamalar uchun).
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();

  const choose = (code) => {
    if (code === lang) return;
    haptic.selection();
    setLang(code);
  };

  return (
    <ul className={styles.list}>
      {SUPPORTED_LANGS.map((code) => (
        <li key={code}>
          <button
            type="button"
            className={styles.item}
            onClick={() => choose(code)}
            aria-pressed={code === lang}
          >
            <span className={styles.flag}>{FLAGS[code]}</span>
            <span className={styles.name}>{t(`language.${code}`)}</span>
            {code === lang && (
              <span className={styles.check}>
                <Icon name="check" size={18} strokeWidth={2.4} />
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
