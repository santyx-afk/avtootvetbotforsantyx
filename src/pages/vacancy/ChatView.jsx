import { useCallback, useEffect, useRef, useState } from 'react';
import { vacancyCall } from '../../lib/vacancyApi.js';
import ProtectedMedia from './ProtectedMedia.jsx';
import OrderModal from './OrderModal.jsx';
import { ORDER_STATUS_LABEL } from './orderStatus.js';
import styles from './vacancy.module.css';

const POLL_MS = 6000;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

const ERRORS = {
  media_too_large: 'Fayl 4 MB dan katta bo’lmasin',
  invalid_media_type: 'Faqat JPEG, PNG, WebP, MP4, MOV',
  empty_message: 'Xabar bo’sh',
  invalid_reason: 'Sababni to’liqroq yozing',
  active_order_exists: 'Bu suhbatda allaqachon faol order bor',
  not_acceptable: 'Bu order endi qabul qilib bo’lmaydi',
  cannot_accept_own: 'O’zingiz yaratgan orderni qabul qila olmaysiz',
  not_cancellable: 'Bu orderni endi bekor qilib bo’lmaydi',
  not_counterable: 'Bu orderga qarshi taklif berib bo’lmaydi',
  counter_limit: 'Qarshi takliflar limiti tugadi (3 ta)',
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function timeLabel(value) {
  return new Date(value).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

// Chat sahifasi: xabarlar, media yuborish, reply, shikoyat va order yaratish/qabul qilish.
export default function ChatView({ chatId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orderModal, setOrderModal] = useState(null); // null | 'create' | order (counter-offer)
  const [orderBusy, setOrderBusy] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const meRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await vacancyCall('chat-messages', { chat_id: chatId });
      setMessages(res.messages || []);
      setMeta(res.chat || null);
    } catch {
      setError('Xabarlar yuklanmadi.');
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // O'z xabarlarimizni ajratish uchun: yuborgandan keyin sender_id ni eslab qolamiz.
  const isMine = (msg) => meRef.current != null && msg.sender_id === meRef.current;

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await vacancyCall('message-send', {
        chat_id: chatId,
        content: text.trim(),
        reply_to_id: replyTo?.id || null,
      });
      meRef.current = res.message.sender_id;
      setMessages((prev) => [...prev, res.message]);
      setText('');
      setReplyTo(null);
    } catch (err) {
      setError(ERRORS[err.message] || 'Yuborilmadi.');
    } finally {
      setSending(false);
    }
  }

  async function sendMedia(file) {
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      setError(ERRORS.media_too_large);
      return;
    }
    setSending(true);
    setError('');
    try {
      const data = await fileToBase64(file);
      const res = await vacancyCall('message-send', {
        chat_id: chatId,
        media: { type: file.type, data },
        reply_to_id: replyTo?.id || null,
      });
      meRef.current = res.message.sender_id;
      setMessages((prev) => [...prev, res.message]);
      setReplyTo(null);
    } catch (err) {
      setError(ERRORS[err.message] || 'Yuklanmadi.');
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submitReport() {
    try {
      await vacancyCall('message-report', {
        chat_id: chatId,
        message_id: reporting.id,
        reason: reportReason.trim(),
      });
      setReporting(null);
      setReportReason('');
      load();
    } catch (err) {
      setError(ERRORS[err.message] || 'Shikoyat yuborilmadi.');
    }
  }

  async function submitOrder(fields) {
    setOrderBusy(true);
    setError('');
    try {
      const isCounter = orderModal && orderModal !== 'create';
      const res = await vacancyCall(isCounter ? 'order-counter' : 'order-create', {
        chat_id: chatId,
        order_id: isCounter ? orderModal.id : undefined,
        ...fields,
      });
      setOrderModal(null);
      await load();
      return res.order;
    } catch (err) {
      setError(ERRORS[err.message] || 'Order yaratilmadi.');
      throw err;
    } finally {
      setOrderBusy(false);
    }
  }

  async function orderAction(action) {
    if (!meta?.active_order || orderBusy) return;
    setOrderBusy(true);
    setError('');
    try {
      await vacancyCall(action, { order_id: meta.active_order.id });
      await load();
    } catch (err) {
      setError(ERRORS[err.message] || 'Amal bajarilmadi.');
    } finally {
      setOrderBusy(false);
    }
  }

  const activeOrder = meta?.active_order;
  const myId = activeOrder ? (meta.role === 'client' ? activeOrder.client_id : activeOrder.worker_user_id) : null;
  const canRespondToOrder = activeOrder?.status === 'created' && activeOrder.created_by !== myId;

  return (
    <div className={styles.chatPage}>
      <div className={styles.chatHeader}>
        <button type="button" className={styles.chatBack} onClick={onBack}>
          ←
        </button>
        <span className={styles.chatHeaderName}>{meta?.worker?.name || 'Suhbat'}</span>
        {!activeOrder && (
          <button
            type="button"
            className={styles.writeBtn}
            style={{ marginLeft: 'auto' }}
            onClick={() => setOrderModal('create')}
          >
            📋 Order
          </button>
        )}
      </div>

      {activeOrder && (
        <div className={styles.chatOrderTag} style={{ padding: '10px var(--app-pad)' }}>
          📋 Order #{activeOrder.id} — {ORDER_STATUS_LABEL[activeOrder.status] || activeOrder.status} •{' '}
          {activeOrder.amount.toLocaleString('uz-UZ')} UZS
          {canRespondToOrder && (
            <div className={styles.regActions} style={{ marginTop: 8 }}>
              <button type="button" className={styles.btnPrimary} disabled={orderBusy} onClick={() => orderAction('order-accept')}>
                ✅ Qabul qilish
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={orderBusy || activeOrder.counter_offer_count >= 3}
                onClick={() => setOrderModal(activeOrder)}
              >
                🔄 Qarshi taklif
              </button>
            </div>
          )}
          {['created', 'accepted'].includes(activeOrder.status) && (
            <button
              type="button"
              className={styles.bubbleAction}
              style={{ marginTop: 8, display: 'block' }}
              disabled={orderBusy}
              onClick={() => orderAction('order-cancel')}
            >
              ❌ Bekor qilish
            </button>
          )}
        </div>
      )}

      <div className={styles.chatBody}>
        {loading && <div className={styles.loading}>Yuklanmoqda...</div>}

        {messages.map((msg) => {
          if (msg.message_type === 'system') {
            return (
              <div key={msg.id} className={styles.sysMessage}>
                {msg.content}
              </div>
            );
          }
          const replied = msg.reply_to_id ? messages.find((m) => m.id === msg.reply_to_id) : null;
          return (
            <div key={msg.id} className={isMine(msg) ? styles.bubbleMine : styles.bubble}>
              {replied && <div className={styles.replyQuote}>{replied.content || '📎 Media'}</div>}
              {msg.media_url && <ProtectedMedia url={msg.media_url} type={msg.message_type} />}
              {msg.content && <div className={styles.bubbleText}>{msg.content}</div>}
              <div className={styles.bubbleFoot}>
                <span>{timeLabel(msg.created_at)}</span>
                <button type="button" className={styles.bubbleAction} onClick={() => setReplyTo(msg)}>
                  ↩︎
                </button>
                <button type="button" className={styles.bubbleAction} onClick={() => setReporting(msg)}>
                  🚩
                </button>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className={styles.regError}>{error}</div>}

      {replyTo && (
        <div className={styles.replyBar}>
          <span>↩︎ {replyTo.content || '📎 Media'}</span>
          <button type="button" className={styles.bubbleAction} onClick={() => setReplyTo(null)}>
            ✕
          </button>
        </div>
      )}

      <div className={styles.chatInputRow}>
        <button type="button" className={styles.attachBtn} onClick={() => fileRef.current?.click()} disabled={sending}>
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          hidden
          onChange={(e) => sendMedia(e.target.files?.[0])}
        />
        <input
          className={styles.chatInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Xabar yozing..."
        />
        <button type="button" className={styles.sendBtn} onClick={send} disabled={sending || !text.trim()}>
          ➤
        </button>
      </div>

      {reporting && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>🚩 Shikoyat</h2>
            <textarea
              className={styles.textarea}
              rows={4}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Nima sababdan shikoyat qilyapsiz?"
              maxLength={500}
            />
            <div className={styles.regActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setReporting(null)}>
                Bekor qilish
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={submitReport}
                disabled={reportReason.trim().length < 5}
              >
                Yuborish
              </button>
            </div>
          </div>
        </div>
      )}

      {orderModal && (
        <OrderModal
          initial={orderModal !== 'create' ? orderModal : null}
          busy={orderBusy}
          onSubmit={submitOrder}
          onClose={() => setOrderModal(null)}
        />
      )}
    </div>
  );
}
