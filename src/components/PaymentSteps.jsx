import { useState } from 'react';
import Spinner from './Spinner.jsx';
import { copyText } from './CopyField.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { formatPrice } from '../utils/format.js';
import { haptic } from '../telegram/webapp.js';
import styles from './PaymentSteps.module.css';

// Karta raqamini o'qish oson bo'lishi uchun 4 talik guruhlarga ajratadi:
// "4067070002820160" -> "4067 0700 0282 0160". Raqam bo'lmasa xom qiymat.
function formatCardNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.replace(/(.{4})/g, '$1 ').trim() : String(value || '');
}

// To'lov bosqichining 3 qadamli ko'rsatmasi — Checkout va TopUp uchun bitta:
// timer, "summani nusxalang", "kartaga o'tkazing", "kuting" + yumshoq eslatma.
// Faqat ko'rinish: countdown va to'lovni aniqlash sahifaning o'zida qoladi.
export default function PaymentSteps({ mmss, amount, cardNumber, support, currency = 'UZS' }) {
  const { t } = useI18n();
  // Qaysi "Nusxalash" tugmasi hozirgina bosilgani ('amount' | 'card' | null) —
  // 1.6 soniya "Nusxalandi ✓" ko'rsatiladi.
  const [copiedStep, setCopiedStep] = useState(null);

  const copyStep = async (key, value) => {
    haptic.impact('light');
    const ok = await copyText(String(value));
    if (!ok) return;
    setCopiedStep(key);
    setTimeout(() => setCopiedStep((cur) => (cur === key ? null : cur)), 1600);
  };

  return (
    <>
      <div className={styles.timerBox}>
        <span className={styles.timerLabel}>{t('checkout.timeLeft')}</span>
        <span className={styles.timer}>{mmss}</span>
      </div>

      {/* 1-qadam: summani nusxalash. Clipboard'ga xom butun son tushadi —
          bank ilovalari bo'shliqli/formatlangan qiymatni qabul qilmaydi. */}
      <div className={styles.stepCard}>
        <div className={styles.stepHead}>
          <span className={styles.stepNum}>1</span>
          <span className={styles.stepTitle}>📋 {t('checkout.step1Title')}</span>
        </div>
        <div className={styles.stepRow}>
          <span className={`${styles.stepValue} ${styles.stepValueBig}`}>
            {formatPrice(amount, currency)}
          </span>
          <button
            type="button"
            className={`${styles.copyBtn} ${copiedStep === 'amount' ? styles.copyBtnDone : ''}`}
            onClick={() => copyStep('amount', Math.round(Number(amount)))}
          >
            {copiedStep === 'amount' ? `${t('checkout.copied')} ✓` : t('checkout.copy')}
          </button>
        </div>
        <p className={styles.stepHint}>{t('checkout.step1Hint')}</p>
      </div>

      {/* 2-qadam: karta raqami (4 talik guruhlarda, clipboard'ga toza raqam) */}
      <div className={styles.stepCard}>
        <div className={styles.stepHead}>
          <span className={styles.stepNum}>2</span>
          <span className={styles.stepTitle}>💳 {t('checkout.step2Title')}</span>
        </div>
        <div className={styles.stepRow}>
          <span className={styles.stepValue}>{formatCardNumber(cardNumber)}</span>
          <button
            type="button"
            className={`${styles.copyBtn} ${copiedStep === 'card' ? styles.copyBtnDone : ''}`}
            onClick={() => copyStep('card', String(cardNumber || '').replace(/\D/g, ''))}
          >
            {copiedStep === 'card' ? `${t('checkout.copied')} ✓` : t('checkout.copy')}
          </button>
        </div>
      </div>

      {/* 3-qadam: kutish — to'lovni tizim o'zi aniqlaydi (sahifadagi polling) */}
      <div className={styles.stepCard}>
        <div className={styles.stepHead}>
          <span className={styles.stepNum}>3</span>
          <span className={styles.stepTitle}>⏳ {t('checkout.step3Title')}</span>
        </div>
        <div className={styles.stepWait}>
          <Spinner size={18} stroke={2} />
          <span>{t('checkout.step3Text')}</span>
        </div>
      </div>

      {/* Eski qizil ogohlantirish o'rniga yumshoq eslatma — ma'no o'sha,
          lekin cho'chitmaydi */}
      <div className={styles.infoBox}>
        <span className={styles.infoIcon}>ℹ️</span>
        <p>{t('checkout.exactAmountInfo')}</p>
      </div>

      <p className={styles.supportHint}>
        {t('checkout.supportHint', { support: support || '@santyx' })}
      </p>
    </>
  );
}
