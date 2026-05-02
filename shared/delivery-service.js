const { fetchPlan, updateOrderStatus, claimInventoryItemForOrder, markInventoryDelivered, createDeliveryLog, createSubscriptionFromOrder } = require('./db');
const { sendMessage } = require('./telegram');
const { decryptText } = require('./encryption');

async function processApprovedDelivery({ supabase, order, adminTelegramId = 'web_admin' }) {
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND', message: 'Buyurtma topilmadi' };
  if (order.delivery_status === 'delivered' || order.inventory_item_id) return { ok: true, code: 'ALREADY_DELIVERED', message: 'Buyurtma oldin yetkazilgan' };
  const plan = await fetchPlan(supabase, order.plan_id || order.planId);
  if (!plan) return { ok: false, code: 'PLAN_NOT_FOUND', message: 'Reja topilmadi' };
  const deliveryType = plan.deliveryType || 'manual';
  const userChatId = order.user_telegram_id;

  if (deliveryType === 'manual') {
    await updateOrderStatus(supabase, order.id, 'approved', { delivery_status: 'manual_required' });
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'manual_required' });
    await sendMessage(userChatId, 'To‘lovingiz tasdiqlandi. Obunangiz admin tomonidan qo‘lda ulanadi.', null);
    return { ok: true, code: 'MANUAL_REQUIRED', message: 'Qo‘lda yetkazib berish kerak' };
  }

  if (deliveryType === 'instruction_only') {
    await sendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\n${plan.deliveryInstructions || 'Yo‘riqnoma admin tomonidan yuboriladi.'}`, null);
    await updateOrderStatus(supabase, order.id, 'completed', { delivery_status: 'delivered', delivered_at: new Date().toISOString(), completed_at: new Date().toISOString() });
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'delivered', delivered_at: new Date().toISOString() });
    await createSubscriptionFromOrder(supabase, order, plan);
    return { ok: true, code: 'DELIVERED', message: 'Yo‘riqnoma yuborildi' };
  }

  if (!process.env.INVENTORY_ENCRYPTION_KEY) {
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'error', error_message: 'INVENTORY_ENCRYPTION_KEY missing' });
    return { ok: false, code: 'MISSING_ENCRYPTION_KEY', message: 'INVENTORY_ENCRYPTION_KEY o‘rnatilmagan' };
  }

  const item = await claimInventoryItemForOrder(supabase, plan.id, order.id, userChatId);
  if (!item) {
    await updateOrderStatus(supabase, order.id, 'approved', { delivery_status: 'waiting_stock' });
    await sendMessage(userChatId, 'To‘lovingiz tasdiqlandi. Obunangiz ulanish jarayonida. Tez orada ma’lumot yuboriladi.', null);
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'waiting_stock' });
    return { ok: false, code: 'NO_STOCK', message: 'Zaxira tugagan' };
  }

  try {
    if (deliveryType === 'auto_account') {
      const password = decryptText(item.password_encrypted);
      await sendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\nObuna: ${plan.name}\nBuyurtma: #${order.order_number}\n\nKirish ma’lumotlari:\nLogin: ${item.login || '-'}\nParol: ${password || '-'}\n\nMuhim: ma’lumotlarni hech kimga yubormang.`, null);
    } else if (deliveryType === 'license_key') {
      const key = decryptText(item.license_key_encrypted);
      await sendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\nObuna: ${plan.name}\nBuyurtma: #${order.order_number}\n\nAktivatsiya kodi:\n${key || '-'}\n\nQo‘llanma:\n${plan.deliveryInstructions || '-'}`, null);
    }
  } catch (error) {
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, inventory_item_id: item.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'error', error_message: 'decrypt_or_send_failed' });
    return { ok: false, code: 'DELIVERY_SEND_FAILED', message: 'Ma’lumotni yuborishda xatolik' };
  }

  await markInventoryDelivered(supabase, item.id, 'sold');
  await updateOrderStatus(supabase, order.id, 'completed', { inventory_item_id: item.id, delivery_status: 'delivered', delivered_at: new Date().toISOString(), completed_at: new Date().toISOString() });
  await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, inventory_item_id: item.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'delivered', delivered_at: new Date().toISOString() });
  await createSubscriptionFromOrder(supabase, order, plan);
  return { ok: true, code: 'DELIVERED', message: 'Yetkazildi' };
}

module.exports = { processApprovedDelivery };
