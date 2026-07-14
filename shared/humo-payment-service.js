const {
  findWaitingOrderByUniquePrice,
  request,
  toQuery,
  markOrderPaidFromPayment,
  insertPaymentLog,
  insertProcessedPaymentMessage,
  trackEvent,
  fetchSettings,
} = require('./db');
const { sendMessage } = require('./telegram');
const { processApprovedOrderDelivery } = require('./delivery-service');

function parseHumoAmount(text = '') {
  const match = String(text).match(/➕\s*([\d\s.]+)(?:,\d{1,2})?\s*UZS/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/[\s.]/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function isHumoNotification(message = {}) {
  const username = String(message.from?.username || message.forward_from?.username || message.forward_origin?.sender_user?.username || '').toLowerCase();
  const text = message.text || message.caption || '';
  return username === 'humocardbot' || (text.includes('Пополнение') && /➕[\s\S]*UZS/i.test(text));
}

function messageKey(message = {}) {
  return [message.chat?.id || 'chat', message.message_id || message.date || Date.now()].join(':');
}

function adminIds(settings) {
  return [...new Set([settings?.admin_telegram_id, process.env.ADMIN_CHAT_ID, process.env.ADMIN_TELEGRAM_ID, ...(process.env.ADMIN_TELEGRAM_IDS || '').split(',')].map((x) => String(x || '').trim()).filter(Boolean))];
}


async function findWaitingOrderByBasePrice(client, amount) {
  const { data } = await request(client, 'orders', { query: toQuery({ select: '*', base_price: `eq.${amount}`, status: 'eq.pending_payment', order: 'created_at.asc', limit: 1 }) });
  return data?.[0] || null;
}

async function handleHumoPaymentNotification({ supabase, message }) {
  if (!isHumoNotification(message)) return { handled: false };
  const text = message.text || message.caption || '';
  const amount = parseHumoAmount(text);
  const key = messageKey(message);
  await insertPaymentLog(supabase, { source: 'humo_card_bot', message_key: key, amount, raw_payload: message, status: amount ? 'parsed' : 'parse_failed' });
  if (!amount) return { handled: true, matched: false };

  const inserted = await insertProcessedPaymentMessage(supabase, { source: 'humo_card_bot', message_key: key, amount, raw_payload: message });
  if (!inserted) return { handled: true, duplicate: true };

  const order = await findWaitingOrderByUniquePrice(supabase, amount);
  if (!order) {
    const baseOrder = await findWaitingOrderByBasePrice(supabase, amount);
    if (baseOrder?.user_telegram_id && Number(baseOrder.unique_price) !== amount) {
      await sendMessage(baseOrder.user_telegram_id, ['To‘lov summasi mos kelmadi.', '', `Siz ${new Intl.NumberFormat('uz-UZ').format(amount)} so‘m yuborgansiz.`, '', 'Kutilayotgan summa:', `${new Intl.NumberFormat('uz-UZ').format(Number(baseOrder.unique_price || 0))} so‘m.`, '', 'Iltimos admin bilan bog‘laning.'].join('\n'), null);
    }
    await insertPaymentLog(supabase, { source: 'humo_card_bot', message_key: key, amount, order_id: baseOrder?.id || null, raw_payload: message, status: baseOrder ? 'wrong_amount' : 'no_waiting_order' });
    return { handled: true, matched: false };
  }
  const paidOrder = await markOrderPaidFromPayment(supabase, order.id, { payment_message_id: key });
  if (!paidOrder) return { handled: true, duplicate: true };
  await insertPaymentLog(supabase, { source: 'humo_card_bot', message_key: key, amount, order_id: order.id, raw_payload: message, status: 'matched' });
  await trackEvent(supabase, { eventType: 'auto_payment_confirmed', telegramId: order.user_telegram_id, planId: order.plan_id, metadata: { orderId: order.id, amount } });
  const delivery = await processApprovedOrderDelivery({ supabase, order: paidOrder, adminTelegramId: 'humo_card_bot' });
  const settings = await fetchSettings(supabase);
  for (const adminChatId of adminIds(settings)) {
    await sendMessage(adminChatId, [`✅ Payment confirmed`, '', `User: <code>${order.user_telegram_id}</code>`, `Order: <code>${order.order_number}</code>`, `Amount: ${new Intl.NumberFormat('uz-UZ').format(amount)} UZS`, '', 'Payment detected automatically.', delivery.ok ? 'Accounts delivered successfully.' : `Delivery status: ${delivery.message}`].join('\n'), null);
  }
  return { handled: true, matched: true, order: paidOrder };
}

module.exports = { parseHumoAmount, isHumoNotification, handleHumoPaymentNotification };
