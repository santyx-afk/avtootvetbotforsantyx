import { useState } from 'react';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { requestContact, haptic, isTelegram } from '../telegram/webapp.js';
import { apiCall } from '../lib/api.js';
import { setContactSaved } from '../utils/storage.js';
import styles from './ContactGate.module.css';

// requestContact javobidan telefon raqamni turli SDK shakllaridan chiqarib oladi.
function extractPhone(payload) {
  if (!payload) return null;
  return (
    payload?.responseUnsafe?.contact?.contact?.phone_number ||
    payload?.response?.contact?.phone_number ||
    payload?.contact?.phone_number ||
    null
  );
}

// Birinchi ochilishda telefon raqam so'raydi va backend orqali Supabase'ga saqlaydi.
// Telegram'da: requestContact (kontakt ulashish). Brauzerda: telefon input maydoni.
export default function ContactGate({ onDone }) {
  const { t } = useI18n();
  const inTelegram = isTelegram();
  const [status, setStatus] = useState('idle'); // idle | saving | error | denied
  const [phoneInput, setPhoneInput] = useState('');

  const saveAndFinish = async (phone, raw = null) => {
    try {
      await apiCall('save-contact', { phone, raw });
      setContactSaved(true);
      haptic.notification('success');
      onDone?.();
    } catch {
      haptic.notification('error');
      setStatus('error');
    }
  };

  const handleShare = async () => {
    haptic.impact('medium');
    setStatus('saving');
    const res = await requestContact();
    if (!res.ok) {
      haptic.notification('warning');
      setStatus('denied');
      return;
    }
    await saveAndFinish(extractPhone(res.payload), res.payload || null);
  };

  const handleBrowserSubmit = async (e) => {
    e.preventDefault();
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 7) {
      setStatus('denied');
      return;
    }
    haptic.impact('medium');
    setStatus('saving');
    await saveAndFinish(`+${digits}`);
  };

  const proceedAnyway = () => {
    setContactSaved(true);
    onDone?.();
  };

  const saving = status === 'saving';

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <div className={styles.iconCircle}>
          <Icon name="phone" size={34} />
        </div>
        <h2 className={styles.title}>{t('contact.title')}</h2>
        <p className={styles.subtitle}>{t('contact.subtitle')}</p>

        {status === 'denied' && <p className={styles.error}>{t('contact.denied')}</p>}
        {status === 'error' && <p className={styles.error}>{t('contact.error')}</p>}
      </div>

      <div className={styles.footer}>
        <p className={styles.why}>{t('contact.why')}</p>

        {inTelegram ? (
          <button
            type="button"
            className={`${styles.cta} pressable`}
            onClick={handleShare}
            disabled={saving}
          >
            {saving ? (
              <>
                <Spinner size={18} stroke={2} /> {t('contact.saving')}
              </>
            ) : (
              t('contact.shareButton')
            )}
          </button>
        ) : (
          <form onSubmit={handleBrowserSubmit} style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 400 }}>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={styles.phoneInput}
              placeholder="+998 90 123 45 67"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
            <button type="submit" className={`${styles.cta} pressable`} disabled={saving}>
              {saving ? (
                <>
                  <Spinner size={18} stroke={2} /> {t('contact.saving')}
                </>
              ) : (
                t('contact.shareButton')
              )}
            </button>
          </form>
        )}

        {status === 'error' && (
          <button type="button" className={styles.secondary} onClick={proceedAnyway}>
            {t('common.continue')}
          </button>
        )}
      </div>
    </div>
  );
}
