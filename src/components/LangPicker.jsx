import { useI18n } from '../i18n/I18nProvider.jsx';
import { SUPPORTED_LANGS } from '../i18n/index.js';
import styles from './LangPicker.module.css';

// Landing header uchun ixcham til almashtirgich.
// LanguageSwitcher komponenti profil sahifasidagi to'liq ro'yxat uchun —
// header'da uning balandligi va ko'rinishi mos kelmaydi, shuning uchun alohida.
const LABELS = { uz: 'UZ', ru: 'RU', en: 'EN' };

export default function LangPicker() {
  const { lang, setLang } = useI18n();

  return (
    <div className={styles.group} role="group" aria-label="Til / Язык / Language">
      {SUPPORTED_LANGS.map((code) => (
        <button
          key={code}
          type="button"
          className={code === lang ? styles.itemActive : styles.item}
          onClick={() => setLang(code)}
          aria-pressed={code === lang}
          lang={code}
        >
          {LABELS[code] || code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
