import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import MyListings from './MyListings.jsx';
import WorkerRegister from './WorkerRegister.jsx';
import WorkerRules from './WorkerRules.jsx';
import styles from './vacancy.module.css';

const EXPERIENCE_LABEL = { 0: '1 yildan kam', 1: '1-2 yil', 2: '2-5 yil', 5: '5+ yil' };
const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

// Vakansiya profili: ishchi holatiga qarab ro'yxatdan o'tish, kutish yoki profil ko'rsatadi.
export default function VacancyProfile() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await vacancyCall('worker-status');
      setStatus(res);
      if (res.state === 'approved' && !res.worker?.rules_accepted) setShowRules(true);
    } catch {
      setStatus({ state: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function acceptRules() {
    await vacancyCall('worker-accept-rules').catch(() => null);
    setShowRules(false);
    load();
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Profil" />
        <div className={styles.loading}>Yuklanmoqda...</div>
      </div>
    );
  }

  if (registering) {
    return (
      <div className={styles.page}>
        <PageHeader title="Ro'yxatdan o'tish" />
        <WorkerRegister
          onCancel={() => setRegistering(false)}
          onDone={(res) => {
            setRegistering(false);
            setStatus(res);
          }}
        />
      </div>
    );
  }

  const { state, worker, verification } = status || {};

  return (
    <div className={styles.page}>
      <PageHeader title="Profil" />

      {state === 'none' && (
        <>
          <div className={styles.profileCard}>
            <span className={styles.profileEmoji}>💼</span>
            <div className={styles.profileTitle}>Ishchi bo&apos;ling</div>
            <p className={styles.profileDesc}>
              Montaj yoki dizayn bo&apos;yicha xizmat ko&apos;rsating, buyurtma oling va daromad qiling.
            </p>
            <button type="button" className={styles.cta} onClick={() => setRegistering(true)}>
              Ro&apos;yxatdan o&apos;tish
            </button>
          </div>
          <p className={styles.note}>Ariza admin tomonidan tekshiriladi.</p>
        </>
      )}

      {state === 'pending' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>⏳</span>
          <div className={styles.statusTitle}>Arizangiz ko&apos;rib chiqilmoqda</div>
          <p className={styles.statusDesc}>Tasdiqlangandan keyin sizga bot orqali xabar yuboriladi.</p>
          {verification?.code && (
            <div className={styles.verifyBox}>
              <div className={styles.verifyLabel}>Tasdiqlash kodi</div>
              <div className={styles.verifyCode}>{verification.code}</div>
              <p className={styles.verifyHint}>
                Shu kodni <b>{verification.phone}</b> raqamiga SMS yoki Telegram orqali jo&apos;nating.
              </p>
            </div>
          )}
        </div>
      )}

      {state === 'rejected' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>❌</span>
          <div className={styles.statusTitle}>Ariza rad etildi</div>
          <p className={styles.statusDesc}>{status.reason || 'Ariza talablarga javob bermadi.'}</p>
          <button type="button" className={styles.btnPrimary} onClick={() => setRegistering(true)}>
            Qayta ariza yuborish
          </button>
        </div>
      )}

      {state === 'banned' && (
        <div className={styles.statusCard}>
          <span className={styles.statusEmoji}>🚫</span>
          <div className={styles.statusTitle}>Hisobingiz to&apos;xtatilgan</div>
          <p className={styles.statusDesc}>{worker?.ban_reason || 'Qoidalar buzilishi.'}</p>
        </div>
      )}

      {state === 'approved' && worker && (
        <>
          <div className={styles.workerCard}>
            <div className={styles.workerName}>{worker.name}</div>
            <div className={styles.workerMeta}>
              ⭐ {worker.avg_rating.toFixed(1)} ({worker.total_reviews} ta baho) •{' '}
              {worker.categories.map((c) => CATEGORY_LABEL[c] || c).join(', ')}
            </div>
            {worker.bio && <p className={styles.workerBio}>{worker.bio}</p>}
            <div className={styles.workerMeta}>💼 Tajriba: {EXPERIENCE_LABEL[worker.experience_years] || '—'}</div>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{money(worker.total_earnings)}</div>
              <div className={styles.statLabel}>Umumiy daromad (UZS)</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{worker.completed_orders}</div>
              <div className={styles.statLabel}>Tugallangan ishlar</div>
            </div>
          </div>

          <MyListings />

          <p className={styles.note}>Sozlamalar va ish vaqti keyingi bosqichda ochiladi.</p>
        </>
      )}

      {state === 'error' && <div className={styles.regError}>Ma&apos;lumot yuklanmadi. Qayta urinib ko&apos;ring.</div>}

      {showRules && <WorkerRules onAccept={acceptRules} />}
    </div>
  );
}
