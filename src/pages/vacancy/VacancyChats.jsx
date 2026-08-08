import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from '../../components/PageHeader.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import ChatView from './ChatView.jsx';
import { ORDER_STATUS_LABEL } from './orderStatus.js';
import styles from './vacancy.module.css';

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });
}

// Suhbatlar ro'yxati — bosilganda chat sahifasi ochiladi.
export default function VacancyChats() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  // Katalogdan "Yozish" bosilganda to'g'ridan-to'g'ri shu chat ochiladi.
  const [openChat, setOpenChat] = useState(location.state?.openChat || null);

  const load = useCallback(async () => {
    try {
      const res = await vacancyCall('chat-list');
      setChats(res.chats || []);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!openChat) load();
  }, [load, openChat]);

  if (openChat) return <ChatView chatId={openChat} onBack={() => setOpenChat(null)} />;

  return (
    <div className={styles.page}>
      <PageHeader title="Chatlar" />

      {loading && <div className={styles.loading}>Yuklanmoqda...</div>}

      {!loading && !chats.length && (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>Suhbatlar yo&apos;q</div>
          <p className={styles.emptyDesc}>
            Bosh sahifadan e&apos;lon tanlang va ishchi bilan bog&apos;laning.
          </p>
        </div>
      )}

      <div className={styles.chatList}>
        {chats.map((chat) => (
          <button key={chat.id} type="button" className={styles.chatRow} onClick={() => setOpenChat(chat.id)}>
            <div className={styles.chatRowTop}>
              <span className={styles.chatPeer}>{chat.peer_name}</span>
              <span className={styles.chatTime}>{timeLabel(chat.last_message_at)}</span>
            </div>
            <div className={styles.chatPreview}>{chat.last_message || 'Xabar yo‘q'}</div>
            {chat.active_order && (
              <div className={styles.chatOrderTag}>
                Order #{chat.active_order.id} — {ORDER_STATUS_LABEL[chat.active_order.status] || chat.active_order.status}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
