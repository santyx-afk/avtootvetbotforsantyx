const {
  findWaitingOrderByUniquePrice,
  request,
  toQuery,
  insertPaymentLog,
  confirmPaymentNotification,
  trackEvent,
  fetchSettings,
  createAuditLog,
  addWalletTransaction,
  getUserBalance,
  updateOrderStatus,
} = require('./db');
const { sendMessage } = require('./telegram');
const { processApprovedOrderDelivery } = require('./delivery-service');
const { matchVacancyPayment } = require('./vacancy-order-service');

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
  const { data } = await request(client, 'orders', { query: toQuery({ select: '*', base_price: `eq.${amount}`, status: 'in.(waiting_payment,pending_payment)', order: 'created_at.asc', limit: 1 }) });
  return data?.[0] || null;
}

function formatUzs(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} UZS`;
}

async function creditTopupOrder({ supabase, order, amount, messageKey }) {
  // topup_credit — cashback bilan hamyonga tushadigan summa (checkout paytida hisoblangan).
  // Bo'lmasa, to'langan summaning o'zi hisoblanadi.
  const credited = Number(order.topup_credit != null ? order.topup_credit : amount || 0);
  await addWalletTransaction(supabase, {
    user_telegram_id: order.user_telegram_id,
    order_id: order.id,
    amount: credited,
    type: 'credit',
    description: `Balans to‘ldirish #${order.order_number}`,
  });
  await updateOrderStatus(supabase, order.id, 'completed', { delivery_status: 'not_required', delivered_at: new Date().toISOString() });
  await createAuditLog(supabase, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'wallet_topup', status: 'completed', metadata: { amount: credited, messageKey } });

  const wallet = await getUserBalance(supabase, order.user_telegram_id);
  await sendMessage(order.user_telegram_id, ['✅ Balansingiz to‘ldirildi!', '', `Qo‘shildi: ${formatUzs(credited)}`, `Joriy balans: ${formatUzs(wallet?.balance)}`].join('\n'), null);

  const settings = await fetchSettings(supabase);
  for (const adminChatId of adminIds(settings)) {
    await sendMessage(adminChatId, ['💰 Balans to‘ldirildi', '', `User: <code>${order.user_telegram_id}</code>`, `Order: <code>${order.order_number}</code>`, `Amount: ${formatUzs(credited)}`, `New balance: ${formatUzs(wallet?.balance)}`].join('\n'), null);
  }
  return { handled: true, matched: true, topup: true, order };
}

async function handleHumoPaymentNotification({ supabase, message }) {
  if (!isHumoNotification(message)) return { handled: false };
  const text = message.text || message.caption || '';
  const amount = parseHumoAmount(text);
  const key = messageKey(message);
  await insertPaymentLog(supabase, { source: 'humo_card_bot', message_key: key, amount, raw_payload: message, status: amount ? 'parsed' : 'parse_failed' });
  if (!amount) return { handled: true, matched: false };

  const confirmation = await confirmPaymentNotification(supabase, { amount, source: 'humo_card_bot', messageKey: key, rawPayload: message });
  if (confirmation?.status === 'duplicate') return { handled: true, duplicate: true };

  const order = confirmation?.order || null;
  if (!order) {
    // Do'kon buyurtmasi topilmadi — vakansiya (freelance) orderi bo'lishi mumkin.
    try {
      const vacancy = await matchVacancyPayment({ supabase, amount, messageKey: key });
      if (vacancy?.matched) {
        await insertPaymentLog(supabase, {
          source: 'humo_card_bot',
          message_key: key,
          amount,
          raw_payload: message,
          status: 'matched_vacancy',
          paid_amount: amount,
        });
        return { handled: true, matched: true, vacancy: true, order: vacancy.order };
      }
    } catch (err) {
      console.warn('vacancy payment match warn:', err?.message);
    }

    const baseOrder = await findWaitingOrderByBasePrice(supabase, amount);
    if (baseOrder?.user_telegram_id && Number(baseOrder.unique_price) !== amount) {
      await sendMessage(baseOrder.user_telegram_id, ['To‘lov summasi mos kelmadi.', '', `Siz ${new Intl.NumberFormat('uz-UZ').format(amount)} so‘m yuborgansiz.`, '', 'Kutilayotgan summa:', `${new Intl.NumberFormat('uz-UZ').format(Number(baseOrder.unique_price || 0))} so‘m.`, '', 'Iltimos admin bilan bog‘laning.'].join('\n'), null);
    }
    await insertPaymentLog(supabase, { source: 'humo_card_bot', message_key: key, amount, order_id: baseOrder?.id || null, raw_payload: message, status: baseOrder ? 'wrong_amount' : 'no_waiting_order' });
    return { handled: true, matched: false };
  }
  const paidOrder = confirmation?.order || order;
  await insertPaymentLog(supabase, { source: 'humo_card_bot', message_key: key, amount, order_id: order.id, raw_payload: message, status: 'matched', user_telegram_id: order.user_telegram_id, base_price: order.base_price, paid_amount: amount, delivery_status: 'pending' });
  await createAuditLog(supabase, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'payment_detected', status: 'payment_detected', metadata: { amount, messageKey: key } });
  await trackEvent(supabase, { eventType: 'auto_payment_confirmed', telegramId: order.user_telegram_id, planId: order.plan_id, metadata: { orderId: order.id, amount } });

  // Balans to'ldirish buyurtmasi: yetkazishga emas, hamyonga boradi
  if (String(paidOrder.order_type || '') === 'topup') {
    return creditTopupOrder({ supabase, order: paidOrder, amount, messageKey: key });
  }

  // Qisman balansdan to'langan bo'lsa — karta to'lovi aniqlangandan keyin
  // balans qismini hamyondan yechamiz (checkout paytida emas — muddat tugasa
  // qaytarish shart bo'lmasligi uchun).
  if (Number(paidOrder.balance_used || 0) > 0) {
    try {
      await addWalletTransaction(supabase, {
        user_telegram_id: paidOrder.user_telegram_id,
        order_id: paidOrder.id,
        amount: Number(paidOrder.balance_used),
        type: 'debit',
        description: `Balansdan yechildi #${paidOrder.order_number}`,
      });
    } catch (err) {
      console.warn('balance debit warn:', err?.message);
    }
  }

  // MUAMMO HAL QILINDI: Qotib qolmasligi uchun 6 soniyalik taymer qo'yildi
  let delivery;
  try {
    const deliveryPromise = processApprovedOrderDelivery({ supabase, order: paidOrder, adminTelegramId: 'humo_card_bot' });
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ ok: false, message: 'Akkaunt tarqatish tizimi 6 soniyada javob bermadi.' }), 6000));
    
    delivery = await Promise.race([deliveryPromise, timeoutPromise]);
  } catch (err) {
    delivery = { ok: false, message: 'Tarqatishda xatolik: ' + err.message };
  }

  const settings = await fetchSettings(supabase);
  for (const adminChatId of adminIds(settings)) {
    await sendMessage(adminChatId, [`✅ Payment confirmed`, '', `User: <code>${order.user_telegram_id}</code>`, `Order: <code>${order.order_number}</code>`, `Amount: ${new Intl.NumberFormat('uz-UZ').format(amount)} UZS`, '', 'Payment detected automatically.', delivery.ok ? 'Accounts delivered successfully.' : `Delivery requires attention: ${delivery.message}`].join('\n'), null);
  }
  return { handled: true, matched: true, order: paidOrder };
}

module.exports = { parseHumoAmount, isHumoNotification, handleHumoPaymentNotification };
