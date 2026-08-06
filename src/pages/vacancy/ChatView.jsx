import { useCallback, useEffect, useRef, useState } from 'react';
import { vacancyCall } from '../../lib/vacancyApi.js';
import ProtectedMedia from './ProtectedMedia.jsx';
import styles from './vacancy.module.css';

const POLL_MS = 6000;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

const ERRORS = {
  media_too_large: 'Fayl 4 MB dan katta bo’lmasin',
  invalid_media_type: 'Faqat JPEG, PNG, WebP, MP4, MOV',
  empty_message: 'Xabar bo’sh',
  invalid_reason: 'Sababni to’liqroq yozing',
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

// Chat sahifasi: xabarlar, media yuborish, reply va shikoyat.
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

  return (
    <div className={styles.chatPage}>
      <div className={styles.chatHeader}>
        <button type="button" className={styles.chatBack} onClick={onBack}>
          ←
        </button>
        <span className={styles.chatHeaderName}>{meta?.worker?.name || 'Suhbat'}</span>
      </div>

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
    </div>
  );
}
