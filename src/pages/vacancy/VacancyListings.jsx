import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import Spinner from '../../components/Spinner.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import styles from './vacancy.module.css';

const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };

const ERRORS = {
  invalid_title: 'Sarlavha kamida 3 ta belgidan iborat bo’lsin',
  invalid_description: 'Tavsif kamida 10 ta belgidan iborat bo’lsin',
  invalid_category: 'Kategoriyani tanlang',
  invalid_price: 'Narxni to’g’ri kiriting',
  listing_limit: 'Bir vaqtda maksimum 3 ta faol e’lon bo’lishi mumkin',
  not_approved: 'Tasdiqlanmaguningizcha faqat chernovik saqlashingiz mumkin',
  not_worker: 'Siz ishchi sifatida ro’yxatdan o’tmagansiz',
};

// E'lon holati mavjud maydonlardan aniqlanadi:
//   aktiv    — joylangan va ko'rinadi
//   noaktiv  — joylangan, lekin vaqtincha yashirilgan
//   arxiv    — hali joylanmagan (chernovik)
function statusOf(l) {
  if (!l.is_published) return 'arxiv';
  return l.is_hidden ? 'noaktiv' : 'aktiv';
}

const STATUS_LABEL = { aktiv: 'Aktiv', noaktiv: 'Noaktiv', arxiv: 'Arxiv' };
const TABS = ['hammasi', 'aktiv', 'noaktiv', 'arxiv'];
const TAB_LABEL = { hammasi: 'Hammasi', ...STATUS_LABEL };

const EMPTY_FORM = { title: '', description: '', category: '', min_price: '' };

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

// Maydon bo'yicha validatsiya — xato aynan qaysi maydonda ekani ko'rsatiladi.
function validateForm(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Sarlavhani kiriting';
  else if (form.title.trim().length < 3) errors.title = 'Sarlavha kamida 3 ta belgi';

  if (!form.category) errors.category = 'Kategoriyani tanlang';

  if (!form.description.trim()) errors.description = 'Nima ish qila olishingizni yozing';
  else if (form.description.trim().length < 10) errors.description = 'Tavsif kamida 10 ta belgi';

  const price = Number(form.min_price);
  if (!String(form.min_price).trim()) errors.min_price = 'Minimal summani kiriting';
  else if (!Number.isFinite(price) || price <= 0) errors.min_price = 'Narx 0 dan katta bo’lsin';

  return errors;
}

// Ishchining e'lonlari: yaratish, tahrirlash, yashirish, o'chirish.
export default function VacancyListings() {
  const [state, setState] = useState({ listings: [], categories: [], is_approved: false });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('hammasi');
  const [editing, setEditing] = useState(null); // null | 'new' | listing
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingId, setPendingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await vacancyCall('my-listings');
      setState(res);
    } catch (err) {
      setError(ERRORS[err.message] || 'E’lonlar yuklanmadi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { hammasi: state.listings.length, aktiv: 0, noaktiv: 0, arxiv: 0 };
    for (const l of state.listings) c[statusOf(l)] += 1;
    return c;
  }, [state.listings]);

  const visible = useMemo(
    () => (tab === 'hammasi' ? state.listings : state.listings.filter((l) => statusOf(l) === tab)),
    [state.listings, tab],
  );

  function openNew() {
    setForm({ ...EMPTY_FORM, category: state.categories[0] || '' });
    setError('');
    setFieldErrors({});
    setEditing('new');
  }

  function openEdit(listing) {
    setForm({
      title: listing.title,
      description: listing.description,
      category: listing.category,
      min_price: String(listing.min_price),
    });
    setError('');
    setFieldErrors({});
    setEditing(listing);
  }

  // Maydon o'zgarganda o'sha maydonning xatosini tozalaymiz.
  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  async function save(publish) {
    const errors = validateForm(form);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = { ...form, min_price: Number(form.min_price), publish };
      if (editing === 'new') await vacancyCall('listing-create', payload);
      else await vacancyCall('listing-update', { ...payload, listing_id: editing.id });
      setEditing(null);
      await load();
    } catch (err) {
      setError(ERRORS[err.message] || 'Saqlanmadi. Qayta urinib ko’ring.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleHidden(listing) {
    setPendingId(listing.id);
    setError('');
    try {
      await vacancyCall('listing-update', { listing_id: listing.id, hidden: !listing.is_hidden });
      await load();
    } catch (err) {
      setError(ERRORS[err.message] || 'Amal bajarilmadi.');
    } finally {
      setPendingId(null);
    }
  }

  async function remove(listing) {
    setPendingId(listing.id);
    setError('');
    try {
      await vacancyCall('listing-delete', { listing_id: listing.id });
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(ERRORS[err.message] || 'O’chirilmadi. Qayta urinib ko’ring.');
      setConfirmDelete(null);
    } finally {
      setPendingId(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader title="E'lonlarim" />
        <div className={styles.loading}>Yuklanmoqda...</div>
      </div>
    );
  }

  if (editing) {
    // Majburiy maydonlar to'ldirilmaguncha "Joylash" rangsiz turadi.
    const ready = Object.keys(validateForm(form)).length === 0;
    return (
      <div className={styles.page}>
        <PageHeader title={editing === 'new' ? "Yangi e'lon" : "E'lonni tahrirlash"} />
        <div className={styles.regStep}>
          <input
            className={`${styles.input} ${fieldErrors.title ? styles.invalid : ''}`}
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="Sarlavha — masalan: Professional video montaj"
            maxLength={120}
          />
          {fieldErrors.title && <span className={styles.fieldError}>{fieldErrors.title}</span>}

          <div className={styles.chips}>
            {state.categories.map((c) => (
              <button
                key={c}
                type="button"
                className={form.category === c ? styles.chipActive : styles.chip}
                onClick={() => setField('category', c)}
              >
                {CATEGORY_LABEL[c] || c}
              </button>
            ))}
          </div>
          {fieldErrors.category && <span className={styles.fieldError}>{fieldErrors.category}</span>}

          <textarea
            className={`${styles.textarea} ${fieldErrors.description ? styles.invalid : ''}`}
            rows={5}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Nima ish qila olasiz, qanday ishlar bajarasiz..."
            maxLength={2000}
          />
          {fieldErrors.description && <span className={styles.fieldError}>{fieldErrors.description}</span>}

          <input
            className={`${styles.input} ${fieldErrors.min_price ? styles.invalid : ''}`}
            inputMode="numeric"
            value={form.min_price}
            onChange={(e) => setField('min_price', e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="Minimal summa (UZS dan)"
          />
          {fieldErrors.min_price && <span className={styles.fieldError}>{fieldErrors.min_price}</span>}

          {error && <div className={styles.regError}>{error}</div>}

          <div className={styles.regActions}>
            <button type="button" className={styles.btnCancel} onClick={() => setEditing(null)} disabled={saving}>
              Bekor qilish
            </button>
            <button type="button" className={styles.btnDraft} onClick={() => save(false)} disabled={saving}>
              {saving ? <Spinner size={16} stroke={2} /> : 'Chernovik'}
            </button>
            {state.is_approved && (
              <button
                type="button"
                className={ready ? styles.btnPrimary : styles.btnMuted}
                onClick={() => save(true)}
                disabled={saving}
              >
                {saving ? <Spinner size={16} stroke={2} /> : 'Joylash'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="E'lonlarim" />

      {!state.is_approved && (
        <p className={styles.note}>
          Tasdiqlanmaguningizcha e&apos;lonlarni faqat chernovik sifatida saqlaysiz.
        </p>
      )}

      <div className={styles.filterRow}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? styles.sortActive : styles.sort}
            onClick={() => setTab(key)}
          >
            {TAB_LABEL[key]} ({counts[key]})
          </button>
        ))}
      </div>

      {error && <div className={styles.regError}>{error}</div>}

      <div className={styles.listingGrid}>
        {visible.map((l) => {
          const status = statusOf(l);
          return (
            <div key={l.id} className={styles.miniListing}>
              <div className={styles.listingTop}>
                <span className={styles.miniListingTitle}>{l.title}</span>
                <span className={styles[`tag_${status}`]}>{STATUS_LABEL[status]}</span>
              </div>
              <div className={styles.listingMeta}>
                {CATEGORY_LABEL[l.category] || l.category} • {money(l.min_price)} UZS dan
              </div>
              <div className={styles.miniListingDesc}>{l.description}</div>

              <div className={styles.listingActions}>
                <button
                  type="button"
                  className={styles.btnEdit}
                  onClick={() => openEdit(l)}
                  disabled={pendingId === l.id}
                >
                  Tahrirlash
                </button>
                {l.is_published && (
                  <button
                    type="button"
                    className={styles.btnHide}
                    onClick={() => toggleHidden(l)}
                    disabled={pendingId === l.id}
                  >
                    {pendingId === l.id ? (
                      <Spinner size={14} stroke={2} />
                    ) : l.is_hidden ? (
                      "Ko'rsatish"
                    ) : (
                      'Yashirish'
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.btnDeleteSm}
                  onClick={() => setConfirmDelete(l)}
                  disabled={pendingId === l.id}
                >
                  O&apos;chirish
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!visible.length && (
        <p className={styles.note}>
          {tab === 'hammasi' ? "Hali e'lon yo'q." : `"${TAB_LABEL[tab]}" bo'limida e'lon yo'q.`}
        </p>
      )}

      <button type="button" className={styles.btnPrimary} onClick={openNew}>
        Yangi e&apos;lon
      </button>

      {confirmDelete && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>E&apos;lonni o&apos;chirish</h2>
            <p className={styles.statusDesc}>
              &laquo;{confirmDelete.title}&raquo; e&apos;loni butunlay o&apos;chiriladi. Bu amalni qaytarib
              bo&apos;lmaydi.
            </p>
            <div className={styles.regActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setConfirmDelete(null)}
                disabled={pendingId === confirmDelete.id}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => remove(confirmDelete)}
                disabled={pendingId === confirmDelete.id}
              >
                {pendingId === confirmDelete.id ? <Spinner size={16} stroke={2} /> : "O'chirish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
