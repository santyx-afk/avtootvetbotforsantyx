import { useState } from 'react';
import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './CopyField.module.css';

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

// Bir tap bilan nusxalanadigan maydon (karta raqami, summa, kredensiallar).
export default function CopyField({ label, value, big = false }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const ok = await copyText(String(value));
    if (ok) {
      haptic.notification('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button type="button" className={styles.field} onClick={onCopy}>
      <div className={styles.texts}>
        {label ? <span className={styles.label}>{label}</span> : null}
        <span className={`${styles.value} ${big ? styles.big : ''}`}>{value}</span>
      </div>
      <span className={`${styles.icon} ${copied ? styles.copied : ''}`}>
        {copied ? (
          <>
            <Icon name="check" size={16} strokeWidth={2.4} />
            <span className={styles.copiedText}>{t('checkout.copied')}</span>
          </>
        ) : (
          <Icon name="copy" size={18} />
        )}
      </span>
    </button>
  );
}
