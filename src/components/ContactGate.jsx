import { useState } from 'react';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { requestContact, haptic } from '../telegram/webapp.js';
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
export default function ContactGate({ onDone }) {
  const { t } = useI18n();
  const [status, setStatus] = useState('idle'); // idle | saving | error | denied

  const handleShare = async () => {
    haptic.impact('medium');
    setStatus('saving');
    const res = await requestContact();
    if (!res.ok) {
      haptic.notification('warning');
      setStatus('denied');
      return;
    }
    try {
      const phone = extractPhone(res.payload);
      await apiCall('save-contact', { phone, raw: res.payload || null });
      setContactSaved(true);
      haptic.notification('success');
      onDone?.();
    } catch {
      // requestContact bo'lsa ham, kontakt botga yuboriladi (webhook ushlaydi),
      // shuning uchun bloklamaymiz — lekin xatoni ko'rsatamiz va davom etishga ruxsat beramiz.
      haptic.notification('error');
      setStatus('error');
    }
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
        {status === 'error' && (
          <button type="button" className={styles.secondary} onClick={proceedAnyway}>
            {t('common.continue')}
          </button>
        )}
      </div>
    </div>
  );
}
