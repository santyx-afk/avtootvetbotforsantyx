const {
  fetchPlan,
  updateOrderStatus,
  claimInventoryItemForOrder,
  markInventoryDelivered,
  createDeliveryLog,
  createSubscriptionFromOrder,
} = require('./db');
const { sendMessage } = require('./telegram');
const { decryptText } = require('./encryption');

function mapTelegramSendError(error) {
  const msg = String(error?.message || '');
  if (/blocked by the user/i.test(msg) || /user is deactivated/i.test(msg)) return 'User botni ochmagan yoki bloklagan';
  if (/chat not found/i.test(msg)) return 'Chat topilmadi';
  if (/forbidden/i.test(msg) || /not enough rights/i.test(msg)) return 'Bot tomonidan yozishga ruxsat yo‘q';
  return msg || 'Userga xabar yuborib bo‘lmadi';
}

function parseExtraData(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function decryptOptional(value) {
  return value ? decryptText(value) : null;
}

function parseInventoryExtraData(item = {}) {
  const encryptedExtra = decryptOptional(item.extra_data_encrypted);
  return parseExtraData(
    item.extra_data
      || item.extra_data_plain
      || item.extra_data_encrypted_plain
      || item.extra_data_json
      || encryptedExtra,
  );
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || null;
}

function resolveAutoAccount(item = {}) {
  const extra = parseInventoryExtraData(item);
  const login = firstValue(item.login, item.email, item.username, extra.login, extra.email, extra.username);
  const password = firstValue(
    item.password,
    item.password_encrypted ? decryptText(item.password_encrypted) : null,
    extra.password,
    extra.pass,
    extra.password_encrypted ? decryptText(extra.password_encrypted) : null,
  );
  return { login, password };
}

function resolveLicenseKey(item = {}) {
  const extra = parseInventoryExtraData(item);
  return firstValue(
    item.license_key,
    item.key,
    item.license_key_encrypted ? decryptText(item.license_key_encrypted) : null,
    extra.key,
    extra.license_key,
    extra.license_key_encrypted ? decryptText(extra.license_key_encrypted) : null,
  );
}

async function safeSendMessage(chatId, text, ctx = {}) {
  try {
    const result = await sendMessage(chatId, text, null);
    console.log('Delivery sendMessage success', { chatId: String(chatId), messageId: result?.message_id, ...ctx });
    return { ok: true, result };
  } catch (error) {
    console.error('Delivery sendMessage failed', { chatId: String(chatId), error: error?.message, stack: error?.stack, ...ctx });
    return { ok: false, error };
  }
}

async function processApprovedDelivery({ supabase, order, adminTelegramId = 'web_admin' }) {
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND', message: 'Buyurtma topilmadi' };
  if (order.delivery_status === 'delivered' || order.inventory_item_id) return { ok: true, code: 'ALREADY_DELIVERED', message: 'Buyurtma oldin yetkazilgan' };

  const plan = await fetchPlan(supabase, order.plan_id);
  if (!plan) return { ok: false, code: 'PLAN_NOT_FOUND', message: 'Reja topilmadi' };

  const deliveryType = plan.delivery_type || 'manual';
  const userChatId = order.user_telegram_id;
  console.log('Approve flow start', { orderId: order.id, orderNumber: order.order_number, status: order.status, deliveryType, userChatId: String(userChatId) });

  if (deliveryType === 'manual') {
    await updateOrderStatus(supabase, order.id, 'approved', { delivery_status: 'manual_required' });
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'manual_required' });
    const sent = await safeSendMessage(userChatId, 'To‘lovingiz tasdiqlandi. Obunangiz admin tomonidan qo‘lda ulanadi.', { orderId: order.id, deliveryType });
    if (!sent.ok) return { ok: false, code: 'DELIVERY_SEND_FAILED', message: mapTelegramSendError(sent.error) };
    return { ok: true, code: 'MANUAL_REQUIRED', message: 'Qo‘lda yetkazib berish kerak' };
  }

  if (deliveryType === 'instruction_only') {
    const sent = await safeSendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\n${plan.deliveryInstructions || 'Yo‘riqnoma admin tomonidan yuboriladi.'}`, { orderId: order.id, deliveryType });
    if (!sent.ok) return { ok: false, code: 'DELIVERY_SEND_FAILED', message: mapTelegramSendError(sent.error) };
    await updateOrderStatus(supabase, order.id, 'completed', { delivery_status: 'delivered', delivered_at: new Date().toISOString(), completed_at: new Date().toISOString() });
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'delivered', delivered_at: new Date().toISOString() });
    await createSubscriptionFromOrder(supabase, order, plan);
    return { ok: true, code: 'DELIVERED', message: 'Yo‘riqnoma yuborildi' };
  }

  if (!process.env.INVENTORY_ENCRYPTION_KEY) {
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'error', error_message: 'INVENTORY_ENCRYPTION_KEY missing' });
    return { ok: false, code: 'MISSING_ENCRYPTION_KEY', message: 'INVENTORY_ENCRYPTION_KEY o‘rnatilmagan' };
  }

  const item = await claimInventoryItemForOrder(supabase, plan.id, order.id, userChatId, deliveryType);
  console.log('Selected inventory item', { orderId: order.id, deliveryType, itemId: item?.id, itemType: item?.type, login: item?.login || null });
  if (!item) {
    await updateOrderStatus(supabase, order.id, 'approved', { delivery_status: 'waiting_stock' });
    const sent = await safeSendMessage(userChatId, 'To‘lovingiz tasdiqlandi. Obunangiz ulanish jarayonida. Tez orada ma’lumot yuboriladi.', { orderId: order.id, deliveryType, noStock: true });
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'waiting_stock' });
    if (!sent.ok) return { ok: false, code: 'DELIVERY_SEND_FAILED', message: mapTelegramSendError(sent.error) };
    return { ok: false, code: 'NO_STOCK', message: 'Zaxira tugagan' };
  }

  try {
    if (item.type && item.type !== deliveryType) {
      throw new Error(`Inventory type mismatch: expected ${deliveryType}, got ${item.type}`);
    }

    if (deliveryType === 'auto_account') {
      const { login, password } = resolveAutoAccount(item);
      if (!login || !password) {
        throw new Error('Inventory account format noto‘g‘ri: login/email/username va password topilmadi');
      }
      const sent = await safeSendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\nObuna: ${plan.name}\nBuyurtma: #${order.order_number}\n\nKirish ma’lumotlari:\nLogin: ${login}\nParol: ${password}\n\nMuhim: ma’lumotlarni hech kimga yubormang.`, { orderId: order.id, deliveryType });
      if (!sent.ok) throw sent.error;
    } else if (deliveryType === 'license_key') {
      const key = resolveLicenseKey(item);
      if (!key) throw new Error('Inventory key format noto‘g‘ri: key/license_key topilmadi');
      const sent = await safeSendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\nObuna: ${plan.name}\nBuyurtma: #${order.order_number}\n\nAktivatsiya kodi:\n${key}\n\nQo‘llanma:\n${plan.deliveryInstructions || '-'}`, { orderId: order.id, deliveryType });
      if (!sent.ok) throw sent.error;
    }
  } catch (error) {
    console.error('Delivery send/decrypt error', { orderId: order.id, error: error?.message, stack: error?.stack });
    const userError = mapTelegramSendError(error);
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, inventory_item_id: item.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'error', error_message: String(error?.message || 'decrypt_or_send_failed') });
    await markInventoryDelivered(supabase, item.id, 'available');
    await updateOrderStatus(supabase, order.id, 'approved', { inventory_item_id: null, delivery_status: 'waiting_approval' });
    return { ok: false, code: 'DELIVERY_SEND_FAILED', message: userError, admin_message: `${userError}. Userga yozib bo‘lmadi. Inventory qaytarildi.` };
  }

  await markInventoryDelivered(supabase, item.id, 'sold');
  await updateOrderStatus(supabase, order.id, 'completed', { inventory_item_id: item.id, delivery_status: 'delivered', delivered_at: new Date().toISOString(), completed_at: new Date().toISOString() });
  await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, inventory_item_id: item.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'delivered', delivered_at: new Date().toISOString() });
  await createSubscriptionFromOrder(supabase, order, plan);
  return { ok: true, code: 'DELIVERED', message: 'Yetkazildi' };
}

module.exports = { processApprovedDelivery, resolveAutoAccount, resolveLicenseKey };
