import { useCallback, useEffect, useState } from 'react';
import Spinner from '../../components/Spinner.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import styles from './vacancy.module.css';

const CATEGORY_LABEL = { montaj: 'Montaj', dizayn: 'Dizayn' };

// Maydon bo'yicha validatsiya — xato aynan qaysi maydonda ekani ko'rsatiladi.
// Ilgari faqat tugma o'chirilardi, foydalanuvchi sababini bilmasdi.
function validateForm(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Sarlavhani kiriting';
  else if (form.title.trim().length < 3) errors.title = 'Sarlavha kamida 3 ta belgi';

  if (!form.category) errors.category = 'Kategoriyani tanlang';

  if (!form.description.trim()) errors.description = 'Tavsifni kiriting';
  else if (form.description.trim().length < 10) errors.description = 'Tavsif kamida 10 ta belgi';

  const price = Number(form.min_price);
  if (!String(form.min_price).trim()) errors.min_price = 'Narxni kiriting';
  else if (!Number.isFinite(price) || price <= 0) errors.min_price = 'Narx 0 dan katta bo’lsin';

  return errors;
}

const ERRORS = {
  invalid_title: 'Sarlavha kamida 3 ta belgidan iborat bo’lsin',
  invalid_description: 'Tavsif kamida 10 ta belgidan iborat bo’lsin',
  invalid_category: 'Kategoriyani tanlang',
  invalid_price: 'Narxni to’g’ri kiriting',
  listing_limit: 'Bir vaqtda maksimum 3 ta faol e’lon bo’lishi mumkin',
  not_approved: 'Tasdiqlanmaguningizcha faqat chernovik saqlashingiz mumkin',
};

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

const EMPTY_FORM = { title: '', description: '', category: '', min_price: '' };

// Ishchining e'lonlari: yaratish, tahrirlash, yashirish, o'chirish.
export default function MyListings() {
  const [state, setState] = useState({ listings: [], categories: [], is_approved: false });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | listing
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingId, setPendingId] = useState(null); // qaysi e'lon ustida amal ketyapti
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await vacancyCall('my-listings');
      setState(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    // Yuborishdan oldin tekshiramiz — bo'sh maydonlarda jimgina to'xtab qolmasin.
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

  if (loading) return <div className={styles.loading}>Yuklanmoqda...</div>;

  if (editing) {
    return (
      <div className={styles.regStep}>
        <h2 className={styles.regTitle}>{editing === 'new' ? "Yangi e'lon" : "E'lonni tahrirlash"}</h2>

        <input
          className={`${styles.input} ${fieldErrors.title ? styles.invalid : ""}`}
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
          className={`${styles.textarea} ${fieldErrors.description ? styles.invalid : ""}`}
          rows={5}
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
          placeholder="Nima qila olasiz, qanday ishlar bajarasiz..."
          maxLength={2000}
        />
        {fieldErrors.description && <span className={styles.fieldError}>{fieldErrors.description}</span>}

        <input
          className={`${styles.input} ${fieldErrors.min_price ? styles.invalid : ""}`}
          inputMode="numeric"
          value={form.min_price}
          onChange={(e) => setField('min_price', e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder="Minimal narx (UZS dan)"
        />
        {fieldErrors.min_price && <span className={styles.fieldError}>{fieldErrors.min_price}</span>}

        {error && <div className={styles.regError}>{error}</div>}

        <div className={styles.regActions}>
          <button type="button" className={styles.btnGhost} onClick={() => setEditing(null)} disabled={saving}>
            Bekor qilish
          </button>
          <button type="button" className={styles.btnGhost} onClick={() => save(false)} disabled={saving}>
            {saving ? <Spinner size={16} stroke={2} /> : 'Chernovik'}
          </button>
          {state.is_approved && (
            <button type="button" className={styles.btnPrimary} onClick={() => save(true)} disabled={saving}>
              {saving ? <Spinner size={16} stroke={2} /> : 'Joylash'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sheetBlock}>
      <div className={styles.sheetBlockTitle}>Mening e&apos;lonlarim</div>

      {!state.is_approved && (
        <p className={styles.note}>Tasdiqlanmaguningizcha e&apos;lonlarni faqat chernovik sifatida saqlaysiz.</p>
      )}

      {state.listings.map((l) => (
        <div key={l.id} className={styles.miniListing}>
          <div className={styles.miniListingTitle}>{l.title}</div>
          <div className={styles.listingMeta}>
            {CATEGORY_LABEL[l.category] || l.category} • {money(l.min_price)} UZS dan •{' '}
            {!l.is_published ? 'Chernovik' : l.is_hidden ? 'Yashirilgan' : 'Faol'}
          </div>
          <div className={styles.listingActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => openEdit(l)}
              disabled={pendingId === l.id}
            >
              Tahrirlash
            </button>
            {l.is_published && (
              <button
                type="button"
                className={styles.btnGhost}
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
              className={styles.btnGhost}
              onClick={() => setConfirmDelete(l)}
              disabled={pendingId === l.id}
            >
              O&apos;chirish
            </button>
          </div>
        </div>
      ))}

      {!state.listings.length && <p className={styles.note}>Hali e&apos;lon yo&apos;q.</p>}

      {error && <div className={styles.regError}>{error}</div>}

      <button type="button" className={styles.btnPrimary} onClick={openNew}>
        Yangi e&apos;lon
      </button>

      {/* O'chirish tasdig'i — amal qaytarib bo'lmaydi */}
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
                className={styles.btnGhost}
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
