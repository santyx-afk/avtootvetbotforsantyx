import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import Faq from '../components/Faq.jsx';
import CopyField from '../components/CopyField.jsx';
import Icon from '../components/Icon.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useTelegram } from '../telegram/TelegramProvider.jsx';
import { apiCall } from '../lib/api.js';
import { readCache, writeCache } from '../lib/cache.js';
import { openTelegramLink, haptic, requestContact } from '../telegram/webapp.js';
import { formatPrice, formatDate } from '../utils/format.js';
import styles from './Profile.module.css';

const SUPPORT = (import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace('@', '');

function initials(user) {
  const a = user?.first_name?.[0] || '';
  const b = user?.last_name?.[0] || '';
  return (a + b).toUpperCase() || '👤';
}

export default function Profile() {
  const { t, lang } = useI18n();
  const { user: tgUser } = useTelegram();
  const navigate = useNavigate();

  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    // Cache til bo'yicha (profil javobi tilga bog'liq — FAQ va h.k.).
    const cacheKey = `profile:${lang}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setData(cached);
      setStatus('ready');
    } else {
      setStatus('loading');
    }
    try {
      const res = await apiCall('profile', { lang });
      setData(res);
      setStatus('ready');
      writeCache(cacheKey, res);
    } catch {
      if (!cached) setStatus('error');
    }
  }, [lang]);

  useEffect(() => {
    load();
  }, [load]);

  const localeMap = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
  const user = data?.user || tgUser || {};
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || t('app.name');
  const currency = 'UZS';

  const shareReferral = () => {
    haptic.impact('light');
    const link = data?.referral?.link || '';
    openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t('profile.referralHint'))}`,
    );
  };

  const openSupport = () => {
    haptic.impact('light');
    openTelegramLink(`https://t.me/${SUPPORT}`);
  };

  // Referal havola qulfdan chiqishi uchun raqam Telegram orqali tasdiqlanadi:
  // requestContact kontaktni botga yuboradi (webhook uni saqlab, tasdiq belgisi
  // qo'yadi), shundan keyin profil qayta yuklanadi.
  const [unlocking, setUnlocking] = useState(false);
  const unlockReferral = async () => {
    haptic.impact('medium');
    setUnlocking(true);
    const res = await requestContact();
    if (!res.ok) {
      setUnlocking(false);
      return;
    }
    setTimeout(() => {
      load().finally(() => setUnlocking(false));
    }, 1800);
  };

  return (
    <>
      <PageHeader title={t('pages.profile.title')} />

      <div className="app-container">
        {/* Foydalanuvchi */}
        <section className={styles.userCard}>
          <div className={styles.avatar}>
            {user.photo_url ? <img src={user.photo_url} alt="" /> : <span>{initials(user)}</span>}
          </div>
          <div className={styles.userInfo}>
            <div className={styles.name}>{fullName}</div>
            {user.username ? <div className={styles.username}>@{user.username}</div> : null}
            {user.phone ? <div className={styles.phone}>{user.phone}</div> : null}
          </div>
        </section>

        {status === 'loading' && (
          <div style={{ marginTop: 16 }}>
            <Skeleton height={96} radius={14} />
            <div style={{ height: 12 }} />
            <Skeleton height={140} radius={14} />
          </div>
        )}

        {status === 'error' && <ErrorState onRetry={load} />}

        {status === 'ready' && data && (
          <>
            {/* Balans */}
            <section className={styles.balanceCard}>
              <div>
                <div className={styles.balanceLabel}>{t('profile.balance')}</div>
                <div className={styles.balanceValue}>{formatPrice(data.balance, currency)}</div>
              </div>
              <button type="button" className={styles.topUpBtn} onClick={() => navigate('/profile/topup')}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                {t('profile.topUp')}
              </button>
            </section>

            {/* Balans tarixi */}
            {data.transactions?.length > 0 && (
              <>
                <div className={styles.sectionTitle}>{t('profile.balanceHistory')}</div>
                <ul className={styles.txList}>
                  {data.transactions.map((tx, i) => {
                    const positive = tx.type !== 'debit';
                    return (
                      <li key={i} className={styles.txRow}>
                        <div className={styles.txInfo}>
                          <span className={styles.txDesc}>
                            {tx.description || t(`profile.tx.${tx.type}`)}
                          </span>
                          <span className={styles.txDate}>{formatDate(tx.created_at, localeMap[lang])}</span>
                        </div>
                        <span className={`${styles.txAmount} ${positive ? styles.txPos : styles.txNeg}`}>
                          {positive ? '+' : '−'}
                          {formatPrice(Math.abs(tx.amount), currency)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* Faol obunalar */}
            <div className={styles.sectionTitle}>{t('profile.activeSubscriptions')}</div>
            {data.subscriptions?.length > 0 ? (
              <ul className={styles.subList}>
                {data.subscriptions.map((s, i) => (
                  <li key={i} className={styles.subCard}>
                    <div className={styles.subMain}>
                      <span className={styles.subName}>{s.plan_name || '—'}</span>
                      <span className={styles.subExpiry}>{formatDate(s.expires_at, localeMap[lang])}</span>
                    </div>
                    {s.days_left != null && (
                      <span className={`${styles.subBadge} ${s.warn ? styles.subWarn : ''}`}>
                        {s.warn && '⚠️ '}
                        {t('profile.daysLeft', { days: s.days_left })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyBox}>{t('profile.noSubscriptions')}</div>
            )}

            {/* Referal */}
            <div className={styles.sectionTitle}>{t('profile.referral')}</div>
            <section className={styles.refCard}>
              {data.referral.locked ? (
                <>
                  {/* Havola raqam Telegram orqali tasdiqlangach ochiladi (nakrutkaga qarshi) */}
                  <p className={styles.refHint}>{t('profile.referralLocked')}</p>
                  <button
                    type="button"
                    className={styles.shareBtn}
                    onClick={unlockReferral}
                    disabled={unlocking}
                  >
                    {unlocking ? '…' : t('profile.unlockReferral')}
                  </button>
                </>
              ) : (
                <>
                  <p className={styles.refHint}>{t('profile.referralHint')}</p>
                  <div className={styles.refStats}>
                    <div className={styles.refStat}>
                      <span className={styles.refStatValue}>{data.referral.invited}</span>
                      <span className={styles.refStatLabel}>{t('profile.invited')}</span>
                    </div>
                    <div className={styles.refStat}>
                      <span className={styles.refStatValue}>{formatPrice(data.referral.bonus_earned, currency)}</span>
                      <span className={styles.refStatLabel}>{t('profile.bonusEarned')}</span>
                    </div>
                  </div>
                  <CopyField label={t('profile.copyLink')} value={data.referral.link} />
                  <button type="button" className={styles.shareBtn} onClick={shareReferral}>
                    <Icon name="share" size={18} strokeWidth={2} />
                    {t('profile.shareLink')}
                  </button>
                </>
              )}
            </section>

            {/* Tug'ilgan kun */}
            <section className={styles.birthday}>
              <span className={styles.birthdayIcon}>🎂</span>
              <div>
                <div className={styles.birthdayTitle}>{t('profile.birthdayTitle')}</div>
                <div className={styles.birthdayHint}>
                  {t('profile.birthdayHint', { percent: data.birthday_discount })}
                </div>
              </div>
            </section>

            {/* FAQ */}
            {data.faq?.length > 0 && (
              <>
                <div className={styles.sectionTitle}>{t('profile.faq')}</div>
                <Faq items={data.faq} />
              </>
            )}
          </>
        )}

        {/* Til */}
        <div className={styles.sectionTitle}>{t('pages.profile.language')}</div>
        <LanguageSwitcher />

        {/* Qo'llab-quvvatlash */}
        <div className={styles.sectionTitle}>{t('pages.profile.support')}</div>
        <ul className={styles.list}>
          <li>
            <button type="button" className={styles.row} onClick={openSupport}>
              <span className={styles.rowIcon}>
                <Icon name="phone" size={20} />
              </span>
              <span className={styles.rowLabel}>@{SUPPORT}</span>
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
          {/* Maxfiylik siyosati — Telegram ichida ham ochilishi kerak, shuning
              uchun tashqi havola emas, ilova ichidagi sahifa. */}
          <li>
            <button type="button" className={styles.row} onClick={() => navigate('/maxfiylik')}>
              <span className={styles.rowIcon}>
                <Icon name="shield" size={20} />
              </span>
              <span className={styles.rowLabel}>{t('cookies.more')}</span>
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
          <li>
            <button type="button" className={styles.row} onClick={() => navigate('/shartlar')}>
              <span className={styles.rowIcon}>
                <Icon name="clipboard" size={20} />
              </span>
              <span className={styles.rowLabel}>{t('terms.link')}</span>
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
