import PageHeader from '../components/PageHeader.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useTelegram } from '../telegram/TelegramProvider.jsx';
import { openTelegramLink, haptic } from '../telegram/webapp.js';
import styles from './Profile.module.css';

const SUPPORT = (import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace('@', '');

function initials(user) {
  const a = user?.first_name?.[0] || '';
  const b = user?.last_name?.[0] || '';
  return (a + b).toUpperCase() || '👤';
}

export default function Profile() {
  const { t } = useI18n();
  const { user } = useTelegram();

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('app.name');

  const openSupport = () => {
    haptic.impact('light');
    openTelegramLink(`https://t.me/${SUPPORT}`);
  };

  return (
    <>
      <PageHeader title={t('pages.profile.title')} />

      <div className="app-container">
        {/* Foydalanuvchi kartasi */}
        <section className={styles.userCard}>
          <div className={styles.avatar}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="" />
            ) : (
              <span>{initials(user)}</span>
            )}
          </div>
          <div className={styles.userInfo}>
            <div className={styles.name}>{fullName}</div>
            {user?.username ? <div className={styles.username}>@{user.username}</div> : null}
          </div>
        </section>

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
        </ul>
      </div>
    </>
  );
}
