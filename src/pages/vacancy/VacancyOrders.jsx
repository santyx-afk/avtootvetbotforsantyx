import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { vacancyCall } from '../../lib/vacancyApi.js';
import { ORDER_STATUS_LABEL, ORDER_FORMAT_LABEL } from './orderStatus.js';
import styles from './vacancy.module.css';

function dateLabel(value) {
  return new Date(value).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Vakansiya buyurtmalari ro'yxati — mijoz yoki ishchi sifatida ishtirok etilgan orderlar.
export default function VacancyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vacancyCall('orders')
      .then((res) => setOrders(res.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <PageHeader title="Orderlar" />

      {loading && <div className={styles.loading}>Yuklanmoqda...</div>}

      {!loading && !orders.length && (
        <div className={styles.empty}>
          <span className={styles.emptyEmoji}>📋</span>
          <span className={styles.emptyTitle}>Hozircha buyurtmalar yo'q</span>
          <span className={styles.emptyDesc}>
            Ishchiga buyurtma berganingizdan so'ng, jarayoni shu yerda kuzatiladi.
          </span>
        </div>
      )}

      <div className={styles.listingGrid}>
        {orders.map((order) => (
          <div key={order.id} className={styles.listingCard} style={{ cursor: 'default' }}>
            <div className={styles.listingTop}>
              <span className={styles.listingName}>#{order.id} {order.title}</span>
            </div>
            <div className={styles.listingMeta}>
              {ORDER_FORMAT_LABEL[order.format] || order.format} • {order.role === 'client' ? 'Mijoz sifatida' : 'Ishchi sifatida'}
            </div>
            <div className={styles.listingFoot}>
              <span className={styles.listingPrice}>{order.amount.toLocaleString('uz-UZ')} UZS</span>
              <span className={styles.listingDone}>{ORDER_STATUS_LABEL[order.status] || order.status}</span>
            </div>
            <div className={styles.listingMeta}>{dateLabel(order.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
