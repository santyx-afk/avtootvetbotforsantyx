import { useCallback, useEffect, useState } from 'react';
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
    setEditing(listing);
  }

  async function save(publish) {
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
    try {
      await vacancyCall('listing-update', { listing_id: listing.id, hidden: !listing.is_hidden });
      await load();
    } catch (err) {
      setError(ERRORS[err.message] || 'Amal bajarilmadi.');
    }
  }

  async function remove(listing) {
    await vacancyCall('listing-delete', { listing_id: listing.id }).catch(() => null);
    await load();
  }

  if (loading) return <div className={styles.loading}>Yuklanmoqda...</div>;

  if (editing) {
    const valid = form.title.trim().length >= 3 && form.description.trim().length >= 10
      && form.category && Number(form.min_price) > 0;
    return (
      <div className={styles.regStep}>
        <h2 className={styles.regTitle}>{editing === 'new' ? "Yangi e'lon" : "E'lonni tahrirlash"}</h2>
        <input
          className={styles.input}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Sarlavha — masalan: Professional video montaj"
          maxLength={120}
        />
        <div className={styles.chips}>
          {state.categories.map((c) => (
            <button
              key={c}
              type="button"
              className={form.category === c ? styles.chipActive : styles.chip}
              onClick={() => setForm({ ...form, category: c })}
            >
              {CATEGORY_LABEL[c] || c}
            </button>
          ))}
        </div>
        <textarea
          className={styles.textarea}
          rows={5}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Nima qila olasiz, qanday ishlar bajarasiz..."
          maxLength={2000}
        />
        <input
          className={styles.input}
          inputMode="numeric"
          value={form.min_price}
          onChange={(e) => setForm({ ...form, min_price: e.target.value.replace(/\D/g, '').slice(0, 9) })}
          placeholder="Minimal narx (UZS dan)"
        />

        {error && <div className={styles.regError}>{error}</div>}

        <div className={styles.regActions}>
          <button type="button" className={styles.btnGhost} onClick={() => setEditing(null)} disabled={saving}>
            Bekor qilish
          </button>
          <button type="button" className={styles.btnGhost} onClick={() => save(false)} disabled={!valid || saving}>
            Chernovik
          </button>
          {state.is_approved && (
            <button type="button" className={styles.btnPrimary} onClick={() => save(true)} disabled={!valid || saving}>
              Joylash
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sheetBlock}>
      <div className={styles.sheetBlockTitle}>📋 Mening e&apos;lonlarim</div>

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
            <button type="button" className={styles.btnGhost} onClick={() => openEdit(l)}>
              Tahrirlash
            </button>
            {l.is_published && (
              <button type="button" className={styles.btnGhost} onClick={() => toggleHidden(l)}>
                {l.is_hidden ? "Ko'rsatish" : 'Yashirish'}
              </button>
            )}
            <button type="button" className={styles.btnGhost} onClick={() => remove(l)}>
              O&apos;chirish
            </button>
          </div>
        </div>
      ))}

      {!state.listings.length && <p className={styles.note}>Hali e&apos;lon yo&apos;q.</p>}

      {error && <div className={styles.regError}>{error}</div>}

      <button type="button" className={styles.btnPrimary} onClick={openNew}>
        + Yangi e&apos;lon
      </button>
    </div>
  );
}
