const {
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
  getOrderById,
} = require('./db');
const { sendMessage } = require('./telegram');
const { processApprovedOrderDelivery } = require('./delivery-service');
const { userLines, fetchUserBrief, markOrderNotification } = require('./admin-notify');
const { escapeHtml } = require('./messages');

// Yetkazishni qancha kutamiz. Netlify funksiyasi ~10 soniyada uzilgani uchun
// cheklov kerak, lekin kutish tugashi "yetkazilmadi" degani EMAS — pastdagi
// deliveryOutcomeFromOrder izohiga qarang.
const DELIVERY_WAIT_MS = Number(process.env.DELIVERY_WAIT_MS || 6000);
const WAIT_TIMEOUT = 'WAIT_TIMEOUT';

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

// Kutish muddati tugagach buyurtmaning BAZADAGI holatiga qarab xulosa chiqaradi.
//
// Nega kerak: yetkazish odatda 5-8 soniya oladi (status yangilash, akkauntni
// deshifrlash, zaxirani band qilish, mijozga xabar, referal, cashback — har
// biri alohida so'rov). Ya'ni kutish tugashi ko'pincha "sekin bo'ldi" degani,
// "yetkazilmadi" degani emas. Ilgari bu farqlanmagani uchun admin muvaffaqiyatli
// buyurtmada ham "Delivery requires attention" xabarini olardi.
function deliveryOutcomeFromOrder(order, waitSeconds) {
  if (!order) {
    return { ok: false, message: `Yetkazish ${waitSeconds} soniyada javob bermadi, buyurtma holati o'qilmadi.` };
  }
  const status = String(order.status || '');
  const deliveryStatus = String(order.delivery_status || '');
  if (status === 'completed' || deliveryStatus === 'delivered' || deliveryStatus === 'not_required') {
    return { ok: true, slow: true, message: `yetkazish ${waitSeconds} soniyadan uzoq davom etdi` };
  }
  if (deliveryStatus === 'waiting_stock') {
    return { ok: false, message: 'Zaxira tugagan — buyurtma istisno navbatiga tushdi, akkaunt qo\'shilishi kerak.' };
  }
  // Bu yerga tushgan buyurtmani tizim o'zi qayta uradi: maintenance cron har 5
  // daqiqada 2 daqiqadan ortiq "delivering" da qolganlarni navbatga qaytaradi.
  return {
    ok: false,
    message: `Yetkazish ${waitSeconds} soniyada tugamadi (holat: ${status || '—'} / ${deliveryStatus || '—'}). Tizim bir necha daqiqada avtomatik qayta uradi.`,
  };
}

async function creditTopupOrder({ supabase, order, amount, messageKey, adminLabel = null }) {
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

  const [settings, user] = await Promise.all([fetchSettings(supabase), fetchUserBrief(supabase, order.user_telegram_id)]);
  const text = [
    adminLabel
      ? `💰 <b>Balans to‘ldirildi — qo‘lda tasdiqlandi</b> (${escapeHtml(adminLabel)})`
      : '💰 <b>Balans to‘ldirildi</b> (avtomatik)',
    '',
    ...userLines(user),
    `🧾 Buyurtma: <code>#${escapeHtml(order.order_number)}</code>`,
    `💵 To‘langan: ${formatUzs(amount)}`,
    `➕ Balansga tushdi: ${formatUzs(credited)}`,
    `👛 Yangi balans: ${formatUzs(wallet?.balance)}`,
  ].join('\n');
  for (const adminChatId of adminIds(settings)) {
    await sendMessage(adminChatId, text, null).catch((e) => console.warn('admin notify warn:', e?.message));
  }
  await markOrderNotification(supabase, order.id, adminLabel ? '✅ To‘lov keldi — qo‘lda tasdiqlandi' : '✅ To‘lov keldi (avtomatik)').catch(() => {});
  return { handled: true, matched: true, topup: true, order };
}

// To'lovi kelgan (avtomatik aniqlangan yoki admin qo'lda tasdiqlagan)
// buyurtmani yakunlaydi: topup bo'lsa balansga, xarid bo'lsa yetkazishga.
// Oxirida adminlarga natija xabari va "yangi buyurtma" xabarini yangilash.
// adminLabel berilsa — qo'lda tasdiqlangan (kim tasdiqlagani ko'rsatiladi).
async function settlePaidOrder({ supabase, order, amount, messageKey, adminLabel = null }) {
  const paidOrder = order;

  // Balans to'ldirish buyurtmasi: yetkazishga emas, hamyonga boradi
  if (String(paidOrder.order_type || '') === 'topup') {
    return creditTopupOrder({ supabase, order: paidOrder, amount, messageKey, adminLabel });
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

  // Funksiya qotib qolmasligi uchun yetkazishni cheklangan vaqt kutamiz
  // (Netlify funksiyasining o'z limiti ~10 soniya).
  const waitSeconds = Math.max(1, Math.round(DELIVERY_WAIT_MS / 1000));
  let delivery;
  try {
    const deliveryPromise = processApprovedOrderDelivery({ supabase, order: paidOrder, adminTelegramId: adminLabel ? `manual:${adminLabel}` : 'humo_card_bot' });
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ ok: false, code: WAIT_TIMEOUT }), DELIVERY_WAIT_MS));
    delivery = await Promise.race([deliveryPromise, timeoutPromise]);
  } catch (err) {
    delivery = { ok: false, message: 'Tarqatishda xatolik: ' + err.message };
  }

  // Kutish tugagan bo'lsa — trevoga ko'tarishdan oldin haqiqiy holatni o'qiymiz.
  if (delivery?.code === WAIT_TIMEOUT) {
    let fresh = null;
    try {
      fresh = await getOrderById(supabase, paidOrder.id);
    } catch (err) {
      console.warn('order recheck warn:', err?.message);
    }
    delivery = deliveryOutcomeFromOrder(fresh, waitSeconds);
  }

  let deliveryLine;
  if (delivery.code === 'MANUAL_REQUIRED') deliveryLine = '🖐 Qo‘lda ulash kerak — admin panel → Buyurtmalar → Yetkazish';
  else if (delivery.ok) deliveryLine = delivery.slow ? `✅ Yetkazildi (${delivery.message})` : '✅ Yetkazildi';
  else deliveryLine = `⚠️ E’tibor kerak: ${delivery.message}`;

  const [settings, user] = await Promise.all([fetchSettings(supabase), fetchUserBrief(supabase, paidOrder.user_telegram_id)]);
  const text = [
    adminLabel
      ? `✅ <b>To‘lov keldi — qo‘lda tasdiqlandi</b> (${escapeHtml(adminLabel)})`
      : '✅ <b>To‘lov keldi — avtomatik aniqlandi</b>',
    '',
    ...userLines(user),
    `🧾 Buyurtma: <code>#${escapeHtml(paidOrder.order_number)}</code>`,
    `💰 Summa: ${formatUzs(amount)}`,
    '',
    `📦 Yetkazish: ${escapeHtml(deliveryLine)}`,
  ].join('\n');
  for (const adminChatId of adminIds(settings)) {
    await sendMessage(adminChatId, text, null).catch((e) => console.warn('admin notify warn:', e?.message));
  }
  await markOrderNotification(supabase, paidOrder.id, adminLabel ? '✅ To‘lov keldi — qo‘lda tasdiqlandi' : '✅ To‘lov keldi (avtomatik)').catch(() => {});
  return { handled: true, matched: true, order: paidOrder, delivery };
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

  return settlePaidOrder({ supabase, order: paidOrder, amount, messageKey: key });
}

module.exports = { parseHumoAmount, isHumoNotification, handleHumoPaymentNotification, deliveryOutcomeFromOrder, settlePaidOrder };
