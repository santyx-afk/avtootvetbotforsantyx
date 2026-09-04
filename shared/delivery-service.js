const {
  fetchPlan,
  updateOrderStatus,
  claimInventoryItemForOrder,
  markInventoryDelivered,
  createDeliveryLog,
  createSubscriptionFromOrder,
  getOrderItems,
  getInventoryItemById,
  updateOrderItem,
  createAuditLog,
  createExceptionQueueItem,
  getInventoryCountsByPlan,
  fetchSettings,
  enqueueDeliveryRetry,
  creditOrderCashback,
  request,
} = require('./db');
const { sendMessage } = require('./telegram');
const { decryptText, isEncryptionKeyHealthy } = require('./encryption');
const { nextRetryAt, hasRetriesLeft } = require('./retry-policy');
const { processReferralPayout } = require('./referral-service');

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

// Akkauntning o'zidagi nuqson (format/tur/shifr) — Telegram yuborish xatosidan farqlash uchun.
function inventoryFault(message) {
  const error = new Error(message);
  error.inventoryFault = true;
  return error;
}

// Deshifrlash xatosi zanjirni to'xtatmasligi kerak: qiymat ochilmasa null qaytaramiz
// va nosozlikni `failures` ga yozamiz. Aks holda bitta buzuq ustun tufayli
// yaroqli muqobil qiymat (masalan extra_data ichidagi parol) ham ishlatilmay qolardi.
function tryDecrypt(value, failures) {
  if (!value) return null;
  try {
    return decryptText(value);
  } catch (error) {
    failures.push(error?.message || 'decrypt_failed');
    return null;
  }
}

function parseInventoryExtraData(item = {}, failures = []) {
  const encryptedExtra = tryDecrypt(item.extra_data_encrypted, failures);
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

// `failures` — ixtiyoriy: berilsa, deshifrlash nosozliklari shunga yig'iladi.
// Chaqiruvchi shu orqali "format xato" bilan "shifr ochilmadi" ni ajratadi.
function resolveAutoAccount(item = {}, failures = []) {
  const extra = parseInventoryExtraData(item, failures);
  const login = firstValue(item.login, item.email, item.username, extra.login, extra.email, extra.username);
  const password = firstValue(
    item.password,
    tryDecrypt(item.password_encrypted, failures),
    extra.password,
    extra.pass,
    tryDecrypt(extra.password_encrypted, failures),
  );
  return { login, password };
}

function resolveLicenseKey(item = {}, failures = []) {
  const extra = parseInventoryExtraData(item, failures);
  return firstValue(
    item.license_key,
    item.key,
    tryDecrypt(item.license_key_encrypted, failures),
    extra.key,
    extra.license_key,
    tryDecrypt(extra.license_key_encrypted, failures),
  );
}

// Kredensial chiqmadi. Sababi shifrmi yoki formatmi — shuni aniqlaymiz, chunki
// oqibati boshqacha: buzuq akkaunt karantinga olinadi, kalit nosoz bo'lsa esa
// akkaunt aybdor emas (aks holda butun zaxira o'chib ketardi).
function credentialFault(failures) {
  if (!failures.length) {
    return inventoryFault('Inventory format noto‘g‘ri: kerakli maydonlar topilmadi');
  }
  if (!isEncryptionKeyHealthy()) {
    const error = new Error('INVENTORY_ENCRYPTION_KEY nosoz — hech qanday shifrlangan maʼlumot ochilmaydi');
    error.encryptionKeyFault = true;
    return error;
  }
  return inventoryFault(`Inventory shifri ochilmadi (kalit soz, akkaunt buzuq): ${failures[0]}`);
}


function resolveAdminChatIds(settings) {
  return [...new Set([settings?.admin_telegram_id, process.env.ADMIN_CHAT_ID, process.env.ADMIN_TELEGRAM_ID, ...(process.env.ADMIN_TELEGRAM_IDS || '').split(',')].map((item) => String(item || '').trim()).filter(Boolean))];
}

// Zaxira kamaygani haqida ogohlantirish — bitta reja uchun 24 soatda bir
// marta (stock-alerts.js), ilgari har sotuvda takrorlanardi.
async function notifyLowInventoryIfNeeded(supabase, plan) {
  if (!['auto_account', 'license_key'].includes(plan.delivery_type || plan.deliveryType)) return;
  const counts = await getInventoryCountsByPlan(supabase, plan.id);
  const { alertLowStock } = require('./stock-alerts');
  await alertLowStock(supabase, { plan, available: Number(counts.available || 0) }).catch((e) => console.warn('low stock alert warn:', e?.message));
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Buzuq akkaunt karantinga olindi — admin buni bilishi kerak, aks holda
// zaxira jimgina kamayib ketadi.
async function notifyAdminsBrokenInventory(supabase, { order, plan, item, reason }) {
  const settings = await fetchSettings(supabase).catch(() => null);
  const text = [
    '🔒 <b>Buzuq akkaunt karantinga olindi</b>',
    '',
    `Reja: ${escapeHtml(plan?.name || '-')}`,
    `Akkaunt ID: <code>${escapeHtml(item?.id)}</code>`,
    `Login: ${escapeHtml(item?.login || '-')}`,
    `Sabab: ${escapeHtml(reason || '-')}`,
    `Buyurtma: #${escapeHtml(order?.order_number || '-')}`,
    '',
    'Akkaunt "disabled" holatiga o‘tkazildi va boshqa mijozga tushmaydi.',
    'Buyurtma zaxiradagi keyingi akkaunt bilan qayta uriniladi.',
  ].join('\n');
  for (const adminChatId of resolveAdminChatIds(settings)) {
    await sendMessage(adminChatId, text, null).catch((e) => console.warn('admin notify warn:', e?.message));
  }
}

// Zaxira tugaganda (to'lov qabul qilingan, lekin akkaunt yo'q) adminlarni ogohlantiradi.
// Xabar ichida "Foydalanuvchiga yozish" havolasi bor: username bo'lsa t.me/username
// (chat to'g'ridan-to'g'ri ochiladi), aks holda tg://user?id=<id> (profil kartasi).
async function notifyAdminsOutOfStock(supabase, { order, plan, userChatId }) {
  const settings = await fetchSettings(supabase).catch(() => null);
  const admins = resolveAdminChatIds(settings);
  if (!admins.length) return;

  let userName = String(userChatId);
  let username = null;
  try {
    const { data } = await request(supabase, 'users', {
      query: `select=username,full_name&telegram_id=eq.${userChatId}&limit=1`,
    });
    const u = data?.[0];
    if (u) {
      userName = u.full_name || u.username || String(userChatId);
      username = u.username || null;
    }
  } catch {
    /* ism topilmasa telegram_id ishlatiladi */
  }

  const link = username ? `https://t.me/${username}` : `tg://user?id=${userChatId}`;
  const amount = new Intl.NumberFormat('uz-UZ').format(
    Number(order.base_price || order.unique_price || order.amount || 0),
  );
  const text = [
    '⚠️ <b>Zaxirada akkaunt qolmadi!</b>',
    '',
    `📦 Obuna: ${escapeHtml(plan.name)}`,
    `👤 Mijoz: ${escapeHtml(userName)}`,
    `🆔 ID: <code>${escapeHtml(userChatId)}</code>`,
    `💰 To‘langan: ${amount} UZS`,
    '',
    `👤 <a href="${link}">Foydalanuvchiga yozish</a>`,
  ].join('\n');

  for (const adminChatId of admins) {
    await safeSendMessage(adminChatId, text, { oosAlert: true, orderId: order.id });
  }
}

// "Zaxira tugadi" bildirishnomasi (mijoz + admin) buyurtma bo'yicha FAQAT BIR marta
// yuborilishini kafolatlaydi. waiting_stock buyurtma har maintenance siklida qayta
// urinilgani uchun (resumeStuckDeliveries) — bu guard admin/mijozni spam qilmaydi.
// true → birinchi marta (yuborish kerak); false → allaqachon yuborilgan.
async function markOutOfStockNotifiedOnce(supabase, orderId) {
  try {
    const prior = await request(supabase, 'audit_logs', {
      query: `select=id&order_id=eq.${orderId}&action=eq.out_of_stock_notified&limit=1`,
    }).then((r) => r.data).catch(() => []);
    if (prior && prior[0]) return false;
    await createAuditLog(supabase, { order_id: orderId, action: 'out_of_stock_notified', status: 'waiting_stock' });
    return true;
  } catch (e) {
    console.warn('markOutOfStockNotifiedOnce warn:', e?.message);
    return true; // shubhali holatda mijozni xabarsiz qoldirmaymiz
  }
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

// Buyurtmaga biriktirilgan inventarni qayta ishlatishdan oldin uni TEKSHIRADI.
// Ilgari `order.inventory_item_id` bo'lsa, akkaunt holatiga qaramay o'shani yuborardi —
// shu sababli admin `disabled` qilgan (yoki allaqachon sotilgan) akkaunt mijozga tushib qolardi.
// Endi faqat haqiqatan ham berish mumkin bo'lgan akkaunt qayta ishlatiladi, aks holda
// zaxiradan yangi `available` akkaunt olinadi.
function isReusableInventoryItem(item, { order, plan, deliveryType }) {
  if (!item) return false;
  if (item.plan_id && plan?.id && String(item.plan_id) !== String(plan.id)) return false;
  if (item.type && deliveryType && item.type !== deliveryType) return false;
  if (item.status === 'available') return true;
  // 'reserved' — faqat shu buyurtma uchun band qilingan bo'lsa (yarim yo'lda uzilgan urinish).
  if (item.status === 'reserved' && item.assigned_order_id && String(item.assigned_order_id) === String(order.id)) return true;
  // disabled / sold / delivered yoki boshqa buyurtma nomiga band — ishlatilmaydi.
  return false;
}

async function resolveDeliveryItem(supabase, { order, plan, deliveryType, userChatId }) {
  if (order.inventory_item_id) {
    const existing = await getInventoryItemById(supabase, order.inventory_item_id);
    if (isReusableInventoryItem(existing, { order, plan, deliveryType })) return existing;
    console.warn('Attached inventory item is not deliverable, claiming a fresh one', {
      orderId: order.id,
      itemId: order.inventory_item_id,
      itemStatus: existing?.status || 'not_found',
    });
    // Eskirgan biriktirmani tozalaymiz, aks holda keyingi urinish ham o'shanga yopishib qoladi.
    await updateOrderStatus(supabase, order.id, order.status, { inventory_item_id: null }).catch((e) => console.warn('detach inventory warn:', e?.message));
  }
  return claimInventoryItemForOrder(supabase, plan.id, order.id, userChatId, deliveryType);
}

async function processApprovedDelivery({ supabase, order, adminTelegramId = 'web_admin' }) {
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND', message: 'Buyurtma topilmadi' };
  if (order.delivery_status === 'delivered') return { ok: true, code: 'ALREADY_DELIVERED', message: 'Buyurtma oldin yetkazilgan' };

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

  const item = await resolveDeliveryItem(supabase, { order, plan, deliveryType, userChatId });
  console.log('Selected inventory item', { orderId: order.id, deliveryType, itemId: item?.id, itemType: item?.type, login: item?.login || null });
  if (!item) {
    // To'lov qabul qilindi, lekin zaxirada akkaunt yo'q → mijozga xabar + adminga alert.
    await updateOrderStatus(supabase, order.id, 'delivering', { delivery_status: 'waiting_stock' });
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'waiting_stock' });
    // Bildirishnoma buyurtma bo'yicha bir marta (retry'lar spam qilmasligi uchun).
    const firstTime = await markOutOfStockNotifiedOnce(supabase, order.id);
    if (firstTime) {
      const sent = await safeSendMessage(
        userChatId,
        '⏳ Zaxirada akkaunt qolmagani sababli hozircha bera olmadik.\nAdmin tez orada siz bilan bog‘lanadi va obunani taqdim etadi.',
        { orderId: order.id, deliveryType, noStock: true },
      );
      await notifyAdminsOutOfStock(supabase, { order, plan, userChatId }).catch((e) => console.warn('oos admin alert warn:', e?.message));
      if (!sent.ok) return { ok: false, code: 'DELIVERY_SEND_FAILED', message: mapTelegramSendError(sent.error) };
    }
    return { ok: false, code: 'NO_STOCK', message: 'Zaxira tugagan' };
  }

  try {
    if (item.type && item.type !== deliveryType) {
      throw inventoryFault(`Inventory type mismatch: expected ${deliveryType}, got ${item.type}`);
    }

    if (deliveryType === 'auto_account') {
      const failures = [];
      const { login, password } = resolveAutoAccount(item, failures);
      if (!login || !password) {
        throw credentialFault(failures);
      }
      const sent = await safeSendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\nObuna: ${plan.name}\nBuyurtma: #${order.order_number}\n\nKirish ma’lumotlari:\nLogin: ${login}\nParol: ${password}\n\nMuhim: ma’lumotlarni hech kimga yubormang.`, { orderId: order.id, deliveryType });
      if (!sent.ok) throw sent.error;
    } else if (deliveryType === 'license_key') {
      const failures = [];
      const key = resolveLicenseKey(item, failures);
      if (!key) throw credentialFault(failures);
      const sent = await safeSendMessage(userChatId, `To‘lovingiz tasdiqlandi.\n\nObuna: ${plan.name}\nBuyurtma: #${order.order_number}\n\nAktivatsiya kodi:\n${key}\n\nQo‘llanma:\n${plan.deliveryInstructions || '-'}`, { orderId: order.id, deliveryType });
      if (!sent.ok) throw sent.error;
    }
  } catch (error) {
    console.error('Delivery send/decrypt error', { orderId: order.id, error: error?.message, stack: error?.stack });
    // Kalit nosozligi konfiguratsiya muammosi — akkaunt aybdor emas va uni
    // karantinga olish butun zaxirani yo'q qilardi. Adminga aniq xabar beramiz.
    const keyFault = error?.encryptionKeyFault === true;
    const userError = keyFault ? error.message : mapTelegramSendError(error);
    await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, inventory_item_id: item.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'error', error_message: String(error?.message || 'decrypt_or_send_failed') });
    // Akkauntning o'zi buzuq bo'lsa (format/shifr xatosi) — zaxiraga qaytarmaymiz, karantinga olamiz,
    // aks holda o'sha buzuq akkaunt keyingi mijozga ham tushib qolaveradi (bitta buzuq
    // yozuv butun yetkazishni to'xtatib qo'yardi). Telegram yoki kalit tomonidagi
    // xatolarda esa akkaunt aybdor emas — 'available' ga qaytariladi.
    const brokenItem = error?.inventoryFault === true;
    await markInventoryDelivered(supabase, item.id, brokenItem ? 'disabled' : 'available');
    if (brokenItem) {
      await notifyAdminsBrokenInventory(supabase, { order, plan, item, reason: error.message }).catch((e) =>
        console.warn('broken inventory alert warn:', e?.message),
      );
    }
    const nextCount = Number(order.delivery_attempts || 0) + 1;
    // Buyurtmaga akkauntni yopishtirib qo'ymaymiz — keyingi urinish zaxiradan yangisini oladi.
    await updateOrderStatus(supabase, order.id, 'delivering', { inventory_item_id: null, delivery_status: 'failed', delivery_error: String(error?.message || 'delivery_failed'), delivery_attempts: nextCount });
    if (hasRetriesLeft(nextCount)) {
      await enqueueDeliveryRetry(supabase, { order_id: order.id, reason: 'delivery_send_failed', retry_count: nextCount, next_retry_at: nextRetryAt(nextCount), metadata: { error: String(error?.message || 'delivery_failed') } });
    }
    return { ok: false, code: 'DELIVERY_SEND_FAILED', message: userError, admin_message: `${userError}. Userga yozib bo‘lmadi. Inventory qaytarildi.` };
  }

  await markInventoryDelivered(supabase, item.id, 'sold');
  await createAuditLog(supabase, { order_id: order.id, user_telegram_id: userChatId, action: 'account_delivered', status: 'delivered', metadata: { planId: plan.id, inventoryItemId: item.id } });
  await updateOrderStatus(supabase, order.id, 'completed', { inventory_item_id: item.id, delivery_status: 'delivered', delivered_at: new Date().toISOString(), completed_at: new Date().toISOString() });
  await createDeliveryLog(supabase, { order_id: order.id, user_telegram_id: userChatId, plan_id: plan.id, inventory_item_id: item.id, delivery_type: deliveryType, admin_telegram_id: String(adminTelegramId), status: 'delivered', delivered_at: new Date().toISOString() });
  await notifyLowInventoryIfNeeded(supabase, plan);
  await createSubscriptionFromOrder(supabase, order, plan);
  return { ok: true, code: 'DELIVERED', message: 'Yetkazildi' };
}


async function processOrderItemDelivery({ supabase, order, item, plan, adminTelegramId }) {
  const result = await processApprovedDelivery({ supabase, order: { ...order, plan_id: plan.id, inventory_item_id: item.inventory_item_id || null, delivery_status: 'waiting_approval' }, adminTelegramId });
  // Qo'lda ulanadigan reja: element hali yetkazilmagan — admin panelda
  // "Yetkazish" qilinganda 'delivered' bo'ladi.
  const manual = result.ok && result.code === 'MANUAL_REQUIRED';
  await updateOrderItem(supabase, item.id, {
    delivery_status: manual ? 'pending' : result.ok ? 'delivered' : result.code === 'NO_STOCK' ? 'waiting_stock' : 'failed',
    delivered_at: result.ok && !manual ? new Date().toISOString() : null,
    delivery_error: result.ok ? null : result.message,
  });
  return result;
}

async function processApprovedOrderDelivery({ supabase, order, adminTelegramId = 'auto_payment' }) {
  await updateOrderStatus(supabase, order.id, 'delivering', { delivery_status: 'waiting_approval' });
  await createAuditLog(supabase, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'delivery_started', status: 'delivering' });
  const items = await getOrderItems(supabase, order.id);
  if (!items.length) return processApprovedDelivery({ supabase, order, adminTelegramId });
  const results = [];
  for (const item of items) {
    if (item.delivery_status === 'delivered') {
      results.push({ ok: true, code: 'ALREADY_DELIVERED' });
      continue;
    }
    if (!item.plan) {
      results.push({ ok: false, code: 'PLAN_NOT_FOUND', message: 'Reja topilmadi' });
      continue;
    }
    results.push(await processOrderItemDelivery({ supabase, order, item, plan: item.plan, adminTelegramId }));
  }
  const failed = results.find((result) => !result.ok);
  if (failed) {
    await updateOrderStatus(supabase, order.id, 'delivering', { delivery_status: failed.code === 'NO_STOCK' ? 'waiting_stock' : 'failed', delivery_error: failed.message });
    await createAuditLog(supabase, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: failed.code === 'NO_STOCK' ? 'exception_queue' : 'delivery_failed', status: 'delivering', metadata: { code: failed.code, message: failed.message } });
    if (failed.code === 'NO_STOCK') await createExceptionQueueItem(supabase, { order_id: order.id, reason: 'no_inventory', metadata: { message: failed.message } });
    else if (hasRetriesLeft(Number(order.delivery_attempts || 0) + 1)) await enqueueDeliveryRetry(supabase, { order_id: order.id, reason: failed.code || 'delivery_failed', retry_count: Number(order.delivery_attempts || 0) + 1, next_retry_at: nextRetryAt(Number(order.delivery_attempts || 0) + 1), metadata: { message: failed.message } });
    else await createExceptionQueueItem(supabase, { order_id: order.id, reason: 'max_retries_exceeded', metadata: { message: failed.message } });
    return failed;
  }
  // Kamida bitta element qo'lda ulanadi: buyurtma "yakunlangan" emas,
  // "tasdiqlangan, qo'lda ulash kerak" holatida qoladi. Ilgari bu yerda u
  // completed/delivered deb belgilanib, admin panelda ko'zdan yo'qolardi.
  // Referal va cashback admin qo'lda yetkazganda hisoblanadi.
  if (results.some((result) => result.code === 'MANUAL_REQUIRED')) {
    await updateOrderStatus(supabase, order.id, 'approved', { delivery_status: 'manual_required' });
    await createAuditLog(supabase, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'manual_required', status: 'approved' });
    return { ok: true, code: 'MANUAL_REQUIRED', message: 'Qo‘lda yetkazib berish kerak', results };
  }
  await updateOrderStatus(supabase, order.id, 'completed', { delivery_status: 'delivered', delivered_at: new Date().toISOString(), completed_at: new Date().toISOString() });
  await createAuditLog(supabase, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'order_completed', status: 'completed' });
  // Referal va cashback bir-biriga bog'liq emas: ketma-ket kutish javobni
  // bekorga sekinlashtiradi (avtomatik to'lov xabarnomasi shu javobni cheklangan
  // vaqt kutadi).
  await Promise.all([
    processReferralPayout(supabase, order).catch((e) => console.warn('referral payout warn:', e?.message)),
    creditOrderCashback(supabase, order).catch((e) => console.warn('cashback warn:', e?.message)),
  ]);
  return { ok: true, code: 'DELIVERED', message: 'Barcha mahsulotlar yetkazildi', results };
}

module.exports = { processApprovedDelivery, processApprovedOrderDelivery, resolveAutoAccount, resolveLicenseKey };
