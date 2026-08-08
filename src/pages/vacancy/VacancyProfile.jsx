import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import MyListings from './MyListings.jsx';
import WorkerRegister from './WorkerRegister.jsx';
import WorkerRules from './WorkerRules.jsx';
import WorkerProfileEdit from './WorkerProfileEdit.jsx';
import styles from './vacancy.module.css';

const EXPERIENCE_LABEL = { 0: '1 yildan kam', 1: '1-2 yil', 2: '2-5 yil', 5: '5+ yil' };
const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };
const DAYS = [
  ['mon', 'Du'], ['tue', 'Se'], ['wed', 'Cho'], ['thu', 'Pa'],
  ['fri', 'Ju'], ['sat', 'Sha'], ['sun', 'Ya'],
];


// Vakansiya profili: ishchi holatiga qarab ro'yxatdan o'tish, kutish yoki profil ko'rsatadi.
export default function VacancyProfile() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busyPending, setBusyPending] = useState(false);

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

  // "Hozir band" — optimistik yangilanadi, xato bo'lsa eski holatga qaytadi.
  async function toggleBusy(nextBusy) {
    setBusyPending(true);
    setStatus((prev) => ({ ...prev, worker: { ...prev.worker, is_busy: nextBusy } }));
    try {
      const res = await vacancyCall('worker-busy', { is_busy: nextBusy });
      setStatus((prev) => ({ ...prev, worker: res.worker }));
    } catch {
      setStatus((prev) => ({ ...prev, worker: { ...prev.worker, is_busy: !nextBusy } }));
    } finally {
      setBusyPending(false);
    }
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
            <div className={styles.profileTitle}>Ishchi bo&apos;ling</div>
            <p className={styles.profileDesc}>
              Montaj yoki dizayn bo&apos;yicha e&apos;lon joylang — mijozlar siz bilan bevosita bog&apos;lanadi.
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
          <div className={styles.statusTitle}>Ariza rad etildi</div>
          <p className={styles.statusDesc}>{status.reason || 'Ariza talablarga javob bermadi.'}</p>
          <button type="button" className={styles.btnPrimary} onClick={() => setRegistering(true)}>
            Qayta ariza yuborish
          </button>
        </div>
      )}

      {state === 'banned' && (
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Hisobingiz to&apos;xtatilgan</div>
          <p className={styles.statusDesc}>{worker?.ban_reason || 'Qoidalar buzilishi.'}</p>
        </div>
      )}

      {state === 'approved' && worker && editing && (
        <WorkerProfileEdit
          worker={worker}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setStatus((prev) => ({ ...prev, worker: updated }));
            setEditing(false);
          }}
        />
      )}

      {state === 'approved' && worker && !editing && (
        <>
          <div className={styles.workerCard}>
            <div className={styles.listingTop}>
              <div className={styles.workerName}>{worker.name}</div>
              <span className={worker.is_busy ? styles.dotBusy : styles.dotFree} />
            </div>
            <div className={styles.workerMeta}>
              {worker.categories.map((c) => CATEGORY_LABEL[c] || c).join(', ')}
            </div>
            {worker.bio && <p className={styles.workerBio}>{worker.bio}</p>}
            <div className={styles.workerMeta}>Tajriba: {EXPERIENCE_LABEL[worker.experience_years] || '—'}</div>
            <div className={styles.workerMeta}>
              {worker.phone} {worker.show_phone ? '(profilda ko‘rinadi)' : '(yashirin)'}
            </div>

            <button type="button" className={styles.btnGhost} onClick={() => setEditing(true)}>
              Profilni tahrirlash
            </button>
          </div>

          {/* "Hozir band" — yoqilsa e'lonlarda band ko'rinadi va yangi chat ochilmaydi */}
          <label className={styles.busyRow}>
            <div>
              <div className={styles.busyTitle}>Hozir band</div>
              <div className={styles.busyDesc}>
                Yoqilsa e&apos;lonlaringizda &quot;Band&quot; deb ko&apos;rinadi.
              </div>
            </div>
            <input
              type="checkbox"
              className={styles.switch}
              checked={Boolean(worker.is_busy)}
              disabled={busyPending}
              onChange={(e) => toggleBusy(e.target.checked)}
            />
          </label>

          <div className={styles.workerCard}>
            <div className={styles.sheetBlockTitle}>Ish vaqti</div>
            {DAYS.map(([key, label]) => {
              const day = worker.work_schedule?.[key];
              return (
                <div key={key} className={styles.scheduleRow}>
                  <span>{label}</span>
                  <span>{day?.from ? `${day.from} - ${day.to}` : 'Dam olish'}</span>
                </div>
              );
            })}
          </div>

          <MyListings />
        </>
      )}

      {state === 'error' && <div className={styles.regError}>Ma&apos;lumot yuklanmadi. Qayta urinib ko&apos;ring.</div>}

      {showRules && <WorkerRules onAccept={acceptRules} />}
    </div>
  );
}
