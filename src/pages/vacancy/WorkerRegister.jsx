import { useState } from 'react';
import { vacancyCall } from '../../lib/vacancyApi.js';
import styles from './vacancy.module.css';

const CATEGORIES = [
  { value: 'montaj', label: 'Montaj' },
  { value: 'dizayn', label: 'Dizayn' },
];

const EXPERIENCE = [
  { value: '<1', label: '1 yildan kam' },
  { value: '1-2', label: '1-2 yil' },
  { value: '2-5', label: '2-5 yil' },
  { value: '5+', label: '5+ yil' },
];

const ERRORS = {
  invalid_phone: 'Telefon raqam noto’g’ri kiritilgan',
  invalid_name: 'Ismni to’liq kiriting',
  invalid_categories: 'Kamida bitta kategoriya tanlang',
  invalid_experience: 'Tajribangizni tanlang',
  invalid_portfolio: 'Kamida bitta to’g’ri havola kiriting (https://...)',
  invalid_card: 'Karta raqami 16 xonali bo’lishi kerak',
  already_approved: 'Siz allaqachon tasdiqlangansiz',
  banned: 'Hisobingiz to’xtatilgan',
};

const STEPS = ['phone', 'name', 'categories', 'experience', 'portfolio', 'bio', 'card'];

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').replace(/^998/, '').slice(0, 9);
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
  return `+998 ${parts.join(' ')}`.trim();
}

// Ishchi (montajor/dizayner) arizasi — 7 bosqichli opros.
export default function WorkerRegister({ onDone, onCancel }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    phone: '+998 ',
    name: '',
    categories: [],
    experience: '',
    portfolio: ['', ''],
    bio: '',
    card: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const current = STEPS[step];
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleCategory = (value) =>
    set('categories', form.categories.includes(value)
      ? form.categories.filter((c) => c !== value)
      : [...form.categories, value]);

  const canContinue = {
    phone: form.phone.replace(/\D/g, '').length >= 12,
    name: form.name.trim().length >= 2,
    categories: form.categories.length > 0,
    experience: Boolean(form.experience),
    portfolio: form.portfolio.some((u) => /^https?:\/\/\S+$/i.test(u.trim())),
    bio: true,
    card: form.card.replace(/\D/g, '').length >= 16,
  }[current];

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const res = await vacancyCall('worker-register', {
        phone: form.phone,
        name: form.name.trim(),
        categories: form.categories,
        experience: form.experience,
        portfolio_urls: form.portfolio.map((u) => u.trim()).filter(Boolean),
        bio: form.bio.trim(),
        card_number: form.card,
      });
      onDone(res);
    } catch (err) {
      setError(ERRORS[err.message] || 'Xatolik yuz berdi. Qayta urinib ko’ring.');
      setSaving(false);
    }
  }

  function next() {
    setError('');
    if (step === STEPS.length - 1) submit();
    else setStep(step + 1);
  }

  function back() {
    setError('');
    if (step === 0) onCancel();
    else setStep(step - 1);
  }

  return (
    <div className={styles.regWrap}>
      <div className={styles.regProgress}>
        <div className={styles.regProgressBar} style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <div className={styles.regStepNo}>
        {step + 1} / {STEPS.length}
      </div>

      {current === 'phone' && (
        <div className={styles.regStep}>
          <h2 className={styles.regTitle}>Telefon raqamingiz</h2>
          <p className={styles.regDesc}>Tasdiqlash uchun ishlatiladi.</p>
          <input
            className={styles.input}
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => set('phone', formatPhone(e.target.value))}
            placeholder="+998 XX XXX XX XX"
          />
        </div>
      )}

      {current === 'name' && (
        <div className={styles.regStep}>
          <h2 className={styles.regTitle}>Ismingiz</h2>
          <p className={styles.regDesc}>Mijozlar sizni shu nom bilan ko&apos;rishadi.</p>
          <input
            className={styles.input}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ism Familiya"
            maxLength={80}
          />
        </div>
      )}

      {current === 'categories' && (
        <div className={styles.regStep}>
          <h2 className={styles.regTitle}>Kategoriya</h2>
          <p className={styles.regDesc}>Ikkalasini ham tanlashingiz mumkin.</p>
          <div className={styles.chips}>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                className={form.categories.includes(c.value) ? styles.chipActive : styles.chip}
                onClick={() => toggleCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {current === 'experience' && (
        <div className={styles.regStep}>
          <h2 className={styles.regTitle}>Tajribangiz</h2>
          <div className={styles.optionList}>
            {EXPERIENCE.map((e) => (
              <button
                key={e.value}
                type="button"
                className={form.experience === e.value ? styles.optionActive : styles.option}
                onClick={() => set('experience', e.value)}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {current === 'portfolio' && (
        <div className={styles.regStep}>
          <h2 className={styles.regTitle}>Portfolio</h2>
          <p className={styles.regDesc}>Instagram yoki Telegram kanal havolasi. Kamida bittasi majburiy.</p>
          {form.portfolio.map((url, i) => (
            <input
              key={i}
              className={styles.input}
              type="url"
              value={url}
              onChange={(e) => set('portfolio', form.portfolio.map((u, j) => (j === i ? e.target.value : u)))}
              placeholder={i === 0 ? 'https://instagram.com/...' : 'https://t.me/... (ixtiyoriy)'}
            />
          ))}
        </div>
      )}

      {current === 'bio' && (
        <div className={styles.regStep}>
          <h2 className={styles.regTitle}>O&apos;zingiz haqingizda</h2>
          <p className={styles.regDesc}>Qanday ishlar qilasiz, qaysi dasturlarda ishlaysiz.</p>
          <textarea
            className={styles.textarea}
            rows={5}
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            maxLength={1000}
            placeholder="3 yillik tajribaga ega montajorman..."
          />
        </div>
      )}

      {current === 'card' && (
        <div className={styles.regStep}>
          <h2 className={styles.regTitle}>Karta raqamingiz</h2>
          <p className={styles.regDesc}>To&apos;lovni shu kartaga olasiz. Istalgan O&apos;zbek kartasi.</p>
          <input
            className={styles.input}
            inputMode="numeric"
            value={form.card}
            onChange={(e) => set('card', e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim())}
            placeholder="8600 0000 0000 0000"
          />
        </div>
      )}

      {error && <div className={styles.regError}>{error}</div>}

      <div className={styles.regActions}>
        <button type="button" className={styles.btnGhost} onClick={back} disabled={saving}>
          {step === 0 ? 'Bekor qilish' : 'Ortga'}
        </button>
        <button type="button" className={styles.btnPrimary} onClick={next} disabled={!canContinue || saving}>
          {saving ? 'Yuborilmoqda...' : step === STEPS.length - 1 ? 'Yuborish' : 'Davom etish'}
        </button>
      </div>
    </div>
  );
}
