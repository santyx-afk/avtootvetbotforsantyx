import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { apiCall } from '../lib/api.js';
import { haptic } from '../telegram/webapp.js';
import styles from './Vacancies.module.css';

// Vaqtinchalik "Vakansiyalar" bo'limi: status xabari + fikr bildirish formasi.
// OLIB TASHLASH: (1) bu fayl + Vacancies.module.css ni o'chiring,
// (2) App.jsx dagi import va route qatorini, (3) TabBar.jsx dagi tab qatorini,
// (4) i18n uz/ru/en dagi tabs.vacancies + vacancies/feedback kalitlarini oling.
export default function Vacancies() {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | success | error | empty

  const submit = async (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) {
      setStatus('empty');
      return;
    }
    haptic.impact('medium');
    setStatus('sending');
    try {
      await apiCall('send-feedback', { message: text.slice(0, 1000) });
      setMessage('');
      setStatus('success');
      haptic.notification('success');
    } catch {
      setStatus('error');
      haptic.notification('error');
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader title={t('tabs.vacancies')} />

      <div className={styles.status}>
        <div className={styles.statusIcon}>🚀</div>
        <h2 className={styles.statusTitle}>{t('vacancies.title')}</h2>
        <p className={styles.statusDesc}>{t('vacancies.desc')}</p>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <h3 className={styles.formTitle}>{t('feedback.title')}</h3>
        <p className={styles.formDesc}>{t('feedback.desc')}</p>
        <textarea
          className={styles.textarea}
          placeholder={t('feedback.placeholder')}
          value={message}
          maxLength={1000}
          rows={4}
          onChange={(e) => {
            setMessage(e.target.value);
            if (status !== 'sending') setStatus('idle');
          }}
        />
        {status === 'success' && <p className={styles.success}>{t('feedback.success')}</p>}
        {status === 'error' && <p className={styles.error}>{t('feedback.error')}</p>}
        {status === 'empty' && <p className={styles.error}>{t('feedback.empty')}</p>}
        <button type="submit" className={styles.sendBtn} disabled={status === 'sending'}>
          {status === 'sending' ? t('common.loading') : t('feedback.send')}
        </button>
      </form>
    </div>
  );
}
