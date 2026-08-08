import { useState } from 'react';
import { ORDER_FORMAT_LABEL } from './orderStatus.js';
import styles from './vacancy.module.css';

const FORMATS = Object.keys(ORDER_FORMAT_LABEL);

// Order yaratish / qarshi taklif berish modali.
// `initial` berilsa — qarshi taklif rejimi (mavjud order tafsilotlari asos qilib olinadi).
export default function OrderModal({ initial, busy, onSubmit, onClose }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [format, setFormat] = useState(initial?.format || FORMATS[0]);
  const [refUrls, setRefUrls] = useState(initial?.reference_urls?.length ? initial.reference_urls : ['']);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [deadlineHours, setDeadlineHours] = useState(initial ? String(initial.deadline_hours) : '24');
  const [hasSourceMaterials, setHasSourceMaterials] = useState(initial?.has_source_materials || false);
  const [error, setError] = useState('');

  const amountNum = Math.round(Number(amount) || 0);
  const commission = Math.round(amountNum * 0.1);
  const workerAmount = amountNum - commission;

  function updateRef(i, value) {
    setRefUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }

  function addRef() {
    if (refUrls.length < 3) setRefUrls((prev) => [...prev, '']);
  }

  async function submit() {
    setError('');
    if (title.trim().length < 3) return setError('Sarlavha kamida 3 belgi');
    if (description.trim().length < 10) return setError('Tavsif kamida 10 belgi');
    if (!amountNum || amountNum <= 0) return setError('Summani kiriting');
    const hours = Number(deadlineHours);
    if (!hours || hours < 1 || hours > 240) return setError('Deadline 1 soatdan 240 soatgacha bo’lishi kerak');

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        format,
        reference_urls: refUrls.map((u) => u.trim()).filter(Boolean),
        notes: notes.trim(),
        amount: amountNum,
        deadline_hours: hours,
        has_source_materials: hasSourceMaterials,
      });
    } catch {
      // xato allaqachon ChatView tomonidan ko'rsatiladi
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
        <h2 className={styles.modalTitle}>{initial ? 'Qarshi taklif' : 'Order yaratish'}</h2>

        <div className={styles.regStep}>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sarlavha"
            maxLength={120}
          />
          <textarea
            className={styles.textarea}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tavsif (zadacha)"
            maxLength={2000}
          />

          <div className={styles.chips}>
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                className={format === f ? styles.chipActive : styles.chip}
                onClick={() => setFormat(f)}
              >
                {ORDER_FORMAT_LABEL[f]}
              </button>
            ))}
          </div>

          {refUrls.map((u, i) => (
            <input
              key={i}
              className={styles.input}
              value={u}
              onChange={(e) => updateRef(i, e.target.value)}
              placeholder={`Referans URL ${i + 1} (ixtiyoriy)`}
            />
          ))}
          {refUrls.length < 3 && (
            <button type="button" className={styles.btnGhost} onClick={addRef}>
              + Yana qo'shish
            </button>
          )}

          <textarea
            className={styles.textarea}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Qo'shimcha izoh (ixtiyoriy)"
            maxLength={500}
          />

          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            value={deadlineHours}
            onChange={(e) => setDeadlineHours(e.target.value)}
            placeholder="Deadline (soat, 1–240)"
          />

          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Summa (UZS)"
          />
          {amountNum > 0 && (
            <div className={styles.note}>
              Komissiya (10%): {commission.toLocaleString('uz-UZ')} UZS • Ishchi oladi:{' '}
              {workerAmount.toLocaleString('uz-UZ')} UZS
            </div>
          )}

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={hasSourceMaterials}
              onChange={(e) => setHasSourceMaterials(e.target.checked)}
            />
            Isxodnik materiallar bor
          </label>
        </div>

        {error && <div className={styles.regError}>{error}</div>}

        <div className={styles.regActions}>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button type="button" className={styles.btnPrimary} onClick={submit} disabled={busy}>
            Yuborish
          </button>
        </div>
      </div>
    </div>
  );
}
