import { useState } from 'react';
import { vacancyCall } from '../../lib/vacancyApi.js';
import styles from './vacancy.module.css';

const DAYS = [
  ['mon', 'Dushanba'], ['tue', 'Seshanba'], ['wed', 'Chorshanba'], ['thu', 'Payshanba'],
  ['fri', 'Juma'], ['sat', 'Shanba'], ['sun', 'Yakshanba'],
];

const ERRORS = {
  invalid_portfolio: 'Kamida bitta to‘g‘ri havola kerak (https://...)',
  not_worker: 'Siz ishchi sifatida ro‘yxatdan o‘tmagansiz',
  banned: 'Hisobingiz to‘xtatilgan',
};

const DEFAULT_HOURS = { from: '09:00', to: '18:00' };

// Profilni tahrirlash: bio, portfolio havolalari, telefon ko'rinishi, ish vaqti.
// Ism/telefon/kategoriya/tajriba bu yerda o'zgarmaydi — ular admin tasdig'iga bog'liq.
export default function WorkerProfileEdit({ worker, onSaved, onCancel }) {
  const [bio, setBio] = useState(worker.bio || '');
  const [urls, setUrls] = useState(worker.portfolio_urls?.length ? [...worker.portfolio_urls] : ['']);
  const [showPhone, setShowPhone] = useState(Boolean(worker.show_phone));
  const [schedule, setSchedule] = useState(() => ({ ...(worker.work_schedule || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setUrl(i, value) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }

  // Kunni yoqish/o'chirish — o'chirilgan kun dam olish hisoblanadi.
  function toggleDay(key) {
    setSchedule((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { ...DEFAULT_HOURS };
      return next;
    });
  }

  function setDayTime(key, field, value) {
    setSchedule((prev) => ({ ...prev, [key]: { ...(prev[key] || DEFAULT_HOURS), [field]: value } }));
  }

  async function save() {
    setError('');
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (!cleanUrls.length) return setError(ERRORS.invalid_portfolio);

    // Boshlanish vaqti tugashdan keyin bo'lgan kunlar saqlanmaydi — oldindan ogohlantiramiz.
    const badDay = DAYS.find(([key]) => schedule[key] && schedule[key].from >= schedule[key].to);
    if (badDay) return setError(`${badDay[1]}: boshlanish vaqti tugash vaqtidan oldin bo‘lsin`);

    setSaving(true);
    try {
      const res = await vacancyCall('worker-profile-update', {
        bio,
        portfolio_urls: cleanUrls,
        show_phone: showPhone,
        work_schedule: schedule,
      });
      onSaved(res.worker);
    } catch (err) {
      setError(ERRORS[err.message] || 'Saqlanmadi. Qayta urinib ko‘ring.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.regWrap}>
      <div className={styles.regStep}>
        <div className={styles.regTitle}>Profilni tahrirlash</div>

        <label className={styles.fieldLabel}>O&apos;zingiz haqingizda</label>
        <textarea
          className={styles.textarea}
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tajribangiz, qanday ishlar qilishingiz..."
          maxLength={1000}
        />

        <label className={styles.fieldLabel}>Portfolio havolalari</label>
        {urls.map((u, i) => (
          <input
            key={i}
            className={styles.input}
            value={u}
            onChange={(e) => setUrl(i, e.target.value)}
            placeholder={i === 0 ? 'https://instagram.com/...' : 'https://t.me/...'}
          />
        ))}
        {urls.length < 2 && (
          <button type="button" className={styles.btnGhost} onClick={() => setUrls((p) => [...p, ''])}>
            + Havola qo&apos;shish
          </button>
        )}


        <label className={styles.checkRow}>
          <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} />
          Telefon raqamim profilimda ko&apos;rinsin
        </label>

        <label className={styles.fieldLabel}>Ish vaqti</label>
        <div className={styles.scheduleEditor}>
          {DAYS.map(([key, label]) => {
            const active = Boolean(schedule[key]);
            return (
              <div key={key} className={styles.scheduleEditRow}>
                <button
                  type="button"
                  className={active ? styles.dayToggleActive : styles.dayToggle}
                  onClick={() => toggleDay(key)}
                >
                  {label}
                </button>
                {active ? (
                  <div className={styles.timeInputs}>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={schedule[key].from}
                      onChange={(e) => setDayTime(key, 'from', e.target.value)}
                    />
                    <span className={styles.timeDash}>—</span>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={schedule[key].to}
                      onChange={(e) => setDayTime(key, 'to', e.target.value)}
                    />
                  </div>
                ) : (
                  <span className={styles.dayOff}>Dam olish</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className={styles.regError}>{error}</div>}

      <div className={styles.regActions}>
        <button type="button" className={styles.btnGhost} onClick={onCancel} disabled={saving}>
          Bekor qilish
        </button>
        <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving}>
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>
    </div>
  );
}
