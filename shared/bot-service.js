const {
  fetchSettings,
  fetchCategories,
  fetchPlansByCategory,
  fetchPlan,
  fetchCategory,
  createOrder,
  createCartItem,
  listCartItems,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  createCheckoutOrder,
  expirePendingOrders,
  reserveInventoryForOrder,
  createAuditLog,
  validatePromoCode,
  getUserBalance,
  getOrderById,
  updateOrderStatus,
  approveOrder,
  rejectOrder,
  isAdminTelegramId,
  upsertUser,
  saveUserState,
  fetchUserState,
  trackEvent,
  insertReceiptSubmission,
  setUserAwaitingReceipt,
} = require('./db');
const {
  inlineKeyboard,
  answerCallbackQuery,
  sendMessage,
  editMessage,
  copyMessage,
} = require('./telegram');
const {
  welcomeText,
  categoriesText,
  planListText,
  planDetailText,
  howItWorksText,
  paymentText,
  receiptForwardCaption,
  receiptAcceptedText,
  noActiveOrderForReceiptText,
  genericOrderErrorText,
  paymentInstructionsWithOrderText,
  cartText,
  autoPaymentInstructionsText,
  balanceText,
  referralText,
} = require('./messages');
const { processApprovedDelivery } = require('./delivery-service');

function navButtons(includeMain = true) {
  const row = [];
  if (includeMain) row.push({ text: '🏠 Bosh menyu', callback_data: 'nav:home' });
  row.push({ text: '⬅️ Orqaga', callback_data: 'nav:back' });
  return [row];
}

function resolveAdminChatId(settings) {
  const fromSettings = settings?.admin_telegram_id;
  const fromIds = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0];
  return fromSettings || process.env.ADMIN_CHAT_ID || process.env.ADMIN_TELEGRAM_ID || fromIds || null;
}

function resolveAdminChatIds(settings) {
  const ids = [];
  if (settings?.admin_telegram_id) ids.push(String(settings.admin_telegram_id));
  if (process.env.ADMIN_CHAT_ID) ids.push(String(process.env.ADMIN_CHAT_ID));
  if (process.env.ADMIN_TELEGRAM_ID) ids.push(String(process.env.ADMIN_TELEGRAM_ID));
  const multi = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map((item) => item.trim()).filter(Boolean);
  ids.push(...multi);
  return [...new Set(ids)];
}

function formatAmount(amount, currency = 'UZS') {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(amount || 0))} ${currency}`;
}

function isSafeOrderId(orderId) {
  return /^[a-f0-9-]{16,64}$/i.test(String(orderId || ''));
}


async function showCategories({ supabase, chatId, messageId, telegramId, asEdit = false }) {
  const settings = await fetchSettings(supabase);
  const categories = await fetchCategories(supabase);
  const text = `${welcomeText(settings)}\n\n${categoriesText()}`;
  const keyboard = inlineKeyboard([
    ...categories.map((category) => [{ text: category.buttonLabel, callback_data: `category:${category.id}` }]),
  ]);

  if (asEdit && messageId) {
    await editMessage(chatId, messageId, text, keyboard);
  } else {
    await sendMessage(chatId, text, keyboard);
  }

  await saveUserState(supabase, telegramId, { screen: 'categories' });
}

async function showPlans({ supabase, chatId, messageId, telegramId, categoryId, parentPlanId = null }) {
  const [category, plans] = await Promise.all([
    fetchCategory(supabase, categoryId),
    fetchPlansByCategory(supabase, categoryId, parentPlanId),
  ]);
  if (!category) {
    await editMessage(chatId, messageId, 'Kategoriya topilmadi.', inlineKeyboard(navButtons(false)));
    return;
  }

  const keyboardRows = plans.map((plan) => [{ text: plan.buttonLabel, callback_data: `plan:${plan.id}` }]);
  keyboardRows.push([{ text: '⬅️ Orqaga', callback_data: 'nav:home' }]);

  await editMessage(chatId, messageId, planListText(category), inlineKeyboard(keyboardRows));
  await saveUserState(supabase, telegramId, {
    screen: 'plans',
    categoryId,
    parentPlanId,
    previous: { screen: 'categories' },
  });
  await trackEvent(supabase, { eventType: 'category_opened', telegramId, categoryId });
}

async function showPlanOrVariants({ supabase, chatId, messageId, telegramId, planId }) {
  const plan = await fetchPlan(supabase, planId);
  if (!plan || !plan.isActive) {
    await editMessage(chatId, messageId, 'Reja topilmadi.', inlineKeyboard(navButtons()));
    return;
  }

  const childPlans = await fetchPlansByCategory(supabase, plan.categoryId, plan.id);
  if (childPlans.length) {
    const rows = childPlans.map((child) => [{ text: child.buttonLabel, callback_data: `plan:${child.id}` }]);
    rows.push([{ text: '⬅️ Orqaga', callback_data: `category:${plan.categoryId}` }]);
    await editMessage(chatId, messageId, `<b>${plan.name}</b> uchun variantni tanlang:`, inlineKeyboard(rows));
    await saveUserState(supabase, telegramId, {
      screen: 'plan-variants',
      categoryId: plan.categoryId,
      parentPlanId: plan.id,
      previous: { screen: 'plans', categoryId: plan.categoryId },
    });
    await trackEvent(supabase, { eventType: 'plan_opened', telegramId, categoryId: plan.categoryId, planId: plan.id, metadata: { hasVariants: true } });
    return;
  }

  const keyboard = inlineKeyboard([
    [{ text: 'ℹ️ Qanday ulanadi', callback_data: `how:${plan.id}` }],
    [{ text: '🛒 Savatchaga qo‘shish', callback_data: `cart_add:${plan.id}` }],
    [{ text: '🛒 Savatchaga o‘tish', callback_data: 'cart_view:open' }],
    [{ text: '⬅️ Orqaga', callback_data: plan.parentPlanId ? `plan:${plan.parentPlanId}` : `category:${plan.categoryId}` }],
  ]);
  await editMessage(chatId, messageId, planDetailText(plan), keyboard);
  await saveUserState(supabase, telegramId, {
    screen: 'plan-detail',
    categoryId: plan.categoryId,
    planId: plan.id,
    previous: {
      screen: plan.parentPlanId ? 'plan-variants' : 'plans',
      categoryId: plan.categoryId,
      parentPlanId: plan.parentPlanId || null,
    },
  });
  await trackEvent(supabase, { eventType: 'plan_opened', telegramId, categoryId: plan.categoryId, planId: plan.id });
}

async function showHowItWorks({ supabase, chatId, messageId, telegramId, planId }) {
  const plan = await fetchPlan(supabase, planId);
  if (!plan) return;
  await editMessage(chatId, messageId, howItWorksText(plan), inlineKeyboard([
    [{ text: '⬅️ Orqaga', callback_data: `plan:${plan.id}` }],
  ]));
  await saveUserState(supabase, telegramId, {
    screen: 'how',
    categoryId: plan.categoryId,
    planId: plan.id,
    previous: { screen: 'plan-detail', categoryId: plan.categoryId, planId: plan.id },
  });
  await trackEvent(supabase, { eventType: 'how_it_works_opened', telegramId, categoryId: plan.categoryId, planId: plan.id });
}


async function showCart({ supabase, chatId, messageId, telegramId, asEdit = true }) {
  const items = await listCartItems(supabase, telegramId);
  const rows = items.flatMap((item) => ([
    [{ text: `➖ ${item.plan?.name || 'Mahsulot'}`, callback_data: `cart_dec:${item.id}` }, { text: `❌`, callback_data: `cart_rm:${item.id}` }],
  ]));
  rows.push([{ text: '💳 To‘lov qilish', callback_data: 'checkout:cart' }]);
  rows.push([{ text: '🛍 Yana mahsulot qo‘shish', callback_data: 'nav:home' }, { text: '🗑 Tozalash', callback_data: 'cart_clear:all' }]);
  const text = cartText(items);
  if (asEdit && messageId) await editMessage(chatId, messageId, text, inlineKeyboard(rows));
  else await sendMessage(chatId, text, inlineKeyboard(rows));
}

async function addPlanToCart({ supabase, chatId, messageId, telegramId, planId }) {
  const plan = await fetchPlan(supabase, planId);
  if (!plan || !plan.isActive) return;
  await upsertUser(supabase, { id: telegramId });
  await createCartItem(supabase, { user_telegram_id: telegramId, plan_id: plan.id, quantity: 1 });
  await editMessage(chatId, messageId, `✅ <b>${plan.name}</b> savatchaga qo‘shildi.`, inlineKeyboard([
    [{ text: '🛒 Savatchaga o‘tish', callback_data: 'cart_view:open' }],
    [{ text: '🛍 Davom etish', callback_data: `category:${plan.categoryId}` }],
  ]));
}

async function checkoutCart({ supabase, chatId, messageId, telegramId }) {
  const expiredOrders = await expirePendingOrders(supabase);
  for (const expired of expiredOrders) {
    if (expired?.user_telegram_id) {
      try {
        await sendMessage(expired.user_telegram_id, `Buyurtma #${expired.order_number} muddati tugadi. To‘lov summasi va zaxira bo‘shatildi.`, null);
      } catch (error) {
        console.warn('Expire notify failed:', error?.message);
      }
    }
  }
  const [items, settings] = await Promise.all([listCartItems(supabase, telegramId), fetchSettings(supabase)]);
  if (!items.length) {
    await editMessage(chatId, messageId, 'Savatchangiz bo‘sh.', inlineKeyboard([[{ text: '🏠 Bosh menyu', callback_data: 'nav:home' }]]));
    return;
  }
  const state = await fetchUserState(supabase, telegramId);
  const basePrice = items.reduce((sum, item) => sum + Number(item.plan?.price || 0) * Number(item.quantity || 1), 0);
  const promoResult = state?.promo_code ? await validatePromoCode(supabase, state.promo_code, basePrice) : null;
  const order = await createCheckoutOrder(supabase, { user_telegram_id: telegramId, items, promo: promoResult?.ok ? promoResult.promo : null });
  await createAuditLog(supabase, { order_id: order.id, user_telegram_id: telegramId, action: 'order_created', status: order.status, metadata: { basePrice, uniquePrice: order.unique_price } });
  const reserved = await reserveInventoryForOrder(supabase, order.id);
  await createAuditLog(supabase, { order_id: order.id, user_telegram_id: telegramId, action: 'payment_waiting', status: order.status, metadata: { reservedInventory: reserved.length } });
  await clearCart(supabase, telegramId);
  await editMessage(chatId, messageId, autoPaymentInstructionsText({ order, items, settings, fallback: { cardNumber: process.env.PAYMENT_CARD_NUMBER, cardOwner: process.env.PAYMENT_CARD_OWNER, support: process.env.SUPPORT_USERNAME } }), inlineKeyboard([
    [{ text: '📋 Kartani nusxalash', copy_text: { text: settings?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '' } }],
    [{ text: '📨 Admin bilan bog‘lanish', url: settings?.support_link?.startsWith('http') ? settings.support_link : `https://t.me/${String(settings?.support_link || process.env.SUPPORT_USERNAME || '@support').replace('@', '')}` }],
    [{ text: '🏠 Bosh menyu', callback_data: 'nav:home' }],
  ]));
  await saveUserState(supabase, telegramId, { screen: 'payment', current_order_id: order.id, awaiting_receipt: false, previous: { screen: 'categories' } });
}

async function showPayment({ supabase, chatId, messageId, telegramId, planId }) {
  const [plan, settings] = await Promise.all([fetchPlan(supabase, planId), fetchSettings(supabase)]);
  if (!plan) return;
  await upsertUser(supabase, { id: telegramId });
  const order = await createOrder(supabase, {
    user_telegram_id: String(telegramId),
    plan_id: plan.id,
    amount: plan.price,
    status: 'pending_payment',
    delivery_status: 'waiting_approval',
    payment_method: 'card_transfer',
  });
  const paymentMessage = paymentInstructionsWithOrderText({
    order: { orderNumber: order.order_number },
    plan,
    settings,
    fallback: {
      cardNumber: process.env.PAYMENT_CARD_NUMBER,
      cardOwner: process.env.PAYMENT_CARD_OWNER,
      instructions: process.env.PAYMENT_INSTRUCTIONS,
      support: process.env.SUPPORT_USERNAME,
    },
  });
  await editMessage(chatId, messageId, paymentMessage, inlineKeyboard([
    [{ text: '📨 Seller bilan bog‘lanish', url: settings?.support_link?.startsWith('http') ? settings.support_link : `https://t.me/${String(settings?.support_link || process.env.SUPPORT_USERNAME || '@support').replace('@', '')}` }],
    [{ text: '⬅️ Orqaga', callback_data: `plan:${plan.id}` }],
  ]));
  await saveUserState(supabase, telegramId, {
    screen: 'payment',
    categoryId: plan.categoryId,
    planId: plan.id,
    selected_plan_id: plan.id,
    current_order_id: order.id,
    awaiting_receipt: true,
    previous_action: 'payment_opened',
    previous: { screen: 'plan-detail', categoryId: plan.categoryId, planId: plan.id },
  });
  await setUserAwaitingReceipt(supabase, telegramId, {
    current_order_id: order.id,
    selected_plan_id: plan.id,
    previous_action: 'payment_opened',
  });
  await trackEvent(supabase, {
    eventType: 'payment_opened',
    telegramId,
    categoryId: plan.categoryId,
    planId: plan.id,
    metadata: { orderId: order.id, orderNumber: order.order_number },
  });
}

async function handleReceipt({ supabase, message }) {
  if (!message?.from?.id || !(message.photo || message.document || message.text)) return;
  if (message.text && message.text.startsWith('/')) return;
  const state = await fetchUserState(supabase, message.from.id);
  const orderId = state?.current_order_id;
  if (!state?.awaiting_receipt || !orderId) {
    await sendMessage(message.chat.id, noActiveOrderForReceiptText(), null);
    return;
  }
  const order = await getOrderById(supabase, orderId);
  if (!order || !['pending_payment', 'waiting_payment'].includes(order.status)) {
    await sendMessage(message.chat.id, noActiveOrderForReceiptText(), null);
    return;
  }

  const [settings, category, plan] = await Promise.all([
    fetchSettings(supabase),
    fetchCategory(supabase, state.categoryId || order.category_id),
    fetchPlan(supabase, state.planId || order.plan_id),
  ]);
  const adminChatIds = resolveAdminChatIds(settings);
  if (!adminChatIds.length) {
    await sendMessage(message.chat.id, genericOrderErrorText(), null);
    return;
  }

  const caption = receiptForwardCaption({
    fullName: [message.from.first_name, message.from.last_name].filter(Boolean).join(' '),
    username: message.from.username ? `@${message.from.username}` : '-',
    telegramId: message.from.id,
    categoryName: category?.name,
    planName: plan?.name,
    timestamp: new Date(message.date * 1000 || Date.now()).toISOString(),
  });

  const receiptFileId = message.photo?.[message.photo.length - 1]?.file_id || message.document?.file_id || null;
  const receiptFileType = message.photo ? 'photo' : message.document ? 'document' : 'text';
  for (const adminChatId of adminChatIds) {
    await copyMessage(adminChatId, message.chat.id, message.message_id, caption);
  }
  await trackEvent(supabase, {
    eventType: 'receipt_sent',
    telegramId: message.from.id,
    categoryId: state.categoryId,
    planId: state.planId,
    metadata: { messageId: message.message_id },
  });
  const receiptRow = await insertReceiptSubmission(supabase, {
    telegram_id: String(message.from.id),
    category_id: state.categoryId,
    plan_id: state.planId,
    order_id: order.id,
    telegram_message_id: String(message.message_id),
    payload: message,
  });
  const updatedOrder = await updateOrderStatus(supabase, order.id, 'payment_uploaded', {
    receipt_submission_id: receiptRow?.id || null,
    receipt_file_id: receiptFileId,
    receipt_file_type: receiptFileType,
    receipt_uploaded_at: new Date().toISOString(),
  });
  await saveUserState(supabase, message.from.id, {
    ...state,
    awaiting_receipt: false,
    previous_action: 'receipt_uploaded',
  });

  const adminSummary = [
    '<b>Yangi buyurtma cheki</b>',
    `Buyurtma: <code>${updatedOrder?.order_number || order.order_number}</code>`,
    `User ID: <code>${message.from.id}</code>`,
    `Username: ${message.from.username ? `@${message.from.username}` : '-'}`,
    `Ism: ${[message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || '-'}`,
    `Reja: ${plan?.name || '-'}`,
    `Summa: ${formatAmount(updatedOrder?.amount || order.amount, plan?.currency || 'UZS')}`,
    `Chek turi: ${receiptFileType}`,
    `Holat: ${updatedOrder?.status || order.status}`,
  ].join('\n');
  const moderationButtons = inlineKeyboard([[
    { text: '✅ Tasdiqlash', callback_data: `ord_ap:${order.id}` },
    { text: '❌ Rad etish', callback_data: `ord_rej:${order.id}` },
  ]]);
  for (const adminChatId of adminChatIds) {
    await sendMessage(adminChatId, adminSummary, moderationButtons);
  }

  await sendMessage(message.chat.id, 'Chekingiz qabul qilindi. To‘lov admin tomonidan tekshiriladi. Natija bo‘yicha sizga xabar beramiz.', null);
}

async function handleCallback({ supabase, callbackQuery }) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  const telegramId = callbackQuery.from?.id;

  try {
    const [action, payload] = data.split(':');
    switch (action) {
      case 'category':
        await showPlans({ supabase, chatId, messageId, telegramId, categoryId: payload });
        break;
      case 'plan':
        await showPlanOrVariants({ supabase, chatId, messageId, telegramId, planId: payload });
        break;
      case 'how':
        await showHowItWorks({ supabase, chatId, messageId, telegramId, planId: payload });
        break;
      case 'buy':
      case 'cart_add':
        await addPlanToCart({ supabase, chatId, messageId, telegramId, planId: payload });
        break;
      case 'cart_view':
        await showCart({ supabase, chatId, messageId, telegramId });
        break;
      case 'cart_rm':
        await removeCartItem(supabase, payload);
        await showCart({ supabase, chatId, messageId, telegramId });
        break;
      case 'cart_dec': {
        await removeCartItem(supabase, payload);
        await showCart({ supabase, chatId, messageId, telegramId });
        break;
      }
      case 'cart_clear':
        await clearCart(supabase, telegramId);
        await showCart({ supabase, chatId, messageId, telegramId });
        break;
      case 'checkout':
        await checkoutCart({ supabase, chatId, messageId, telegramId });
        break;
      case 'promo':
        await saveUserState(supabase, telegramId, { ...(await fetchUserState(supabase, telegramId)), awaiting_promo: true });
        await sendMessage(chatId, 'Promo kodni yuboring:', null);
        break;
      case 'admin':
        if (isAdminTelegramId(telegramId)) {
          await sendMessage(chatId, '<b>Admin panel</b>\n\nOrders • Inventory • Payments • Users • Promo Codes • Referral System • Statistics • Broadcast Messages • Settings', null);
        }
        break;
      case 'pay':
        await addPlanToCart({ supabase, chatId, messageId, telegramId, planId: payload });
        break;
      case 'noop':
        break;
      case 'ord_ap': {
        if (!isAdminTelegramId(telegramId)) {
          await answerCallbackQuery(callbackQuery.id, 'Sizda bu amal uchun ruxsat yo‘q.');
          return;
        }
        if (!isSafeOrderId(payload)) {
          await answerCallbackQuery(callbackQuery.id, 'Buyurtma ID xato.');
          return;
        }
        const result = await approveOrder(supabase, payload);
        if (!result.ok) {
          if (result.reason === 'not_found') {
            await answerCallbackQuery(callbackQuery.id, 'Buyurtma topilmadi.');
          } else if (result.reason === 'already_processed') {
            await answerCallbackQuery(callbackQuery.id, 'Bu buyurtma allaqachon qayta ishlangan.');
          } else {
            await answerCallbackQuery(callbackQuery.id, 'Buyurtma holati mos emas.');
          }
          return;
        }
        const order = result.order;
        await trackEvent(supabase, { eventType: 'order_approved', telegramId, planId: order.plan_id, metadata: { orderId: order.id } });
        let userNotifyFailed = false;
        let deliveryResult = null;
        try {
          deliveryResult = await processApprovedDelivery({ supabase, order, adminTelegramId: telegramId });
        } catch (error) {
          userNotifyFailed = true;
          console.error('Delivery process fail', error);
        }
        if (chatId && messageId) {
          const text = `${callbackQuery.message?.text || 'Buyurtma'}\n\n✅ YAKUNIY HOLAT: TASDIQLANDI`;
          await editMessage(chatId, messageId, text);
        }
        if (deliveryResult?.code === 'MANUAL_REQUIRED') {
          await sendMessage(chatId, 'Bu buyurtma qo‘lda yetkazib berilishi kerak.', null);
        } else if (deliveryResult?.code === 'NO_STOCK') {
          await sendMessage(chatId, 'Zaxirada bu obuna uchun ma’lumot qolmagan. Iltimos, inventory qo‘shing yoki qo‘lda yetkazib bering.', null);
        } else if (deliveryResult && !deliveryResult.ok) {
          await sendMessage(chatId, `Avto-yetkazib berish xatosi: ${deliveryResult.admin_message || deliveryResult.message}`, null);
        }
        if (userNotifyFailed) {
          await answerCallbackQuery(callbackQuery.id, 'Buyurtma tasdiqlandi, lekin foydalanuvchiga xabar yuborilmadi.');
        } else {
          await answerCallbackQuery(callbackQuery.id, 'Buyurtma tasdiqlandi.');
        }
        return;
      }
      case 'ord_rej': {
        if (!isAdminTelegramId(telegramId)) {
          await answerCallbackQuery(callbackQuery.id, 'Sizda bu amal uchun ruxsat yo‘q.');
          return;
        }
        if (!isSafeOrderId(payload)) {
          await answerCallbackQuery(callbackQuery.id, 'Buyurtma ID xato.');
          return;
        }
        const result = await rejectOrder(supabase, payload);
        if (!result.ok) {
          if (result.reason === 'not_found') {
            await answerCallbackQuery(callbackQuery.id, 'Buyurtma topilmadi.');
          } else if (result.reason === 'already_processed') {
            await answerCallbackQuery(callbackQuery.id, 'Bu buyurtma allaqachon qayta ishlangan.');
          } else {
            await answerCallbackQuery(callbackQuery.id, 'Buyurtma holati mos emas.');
          }
          return;
        }
        const order = result.order;
        await trackEvent(supabase, { eventType: 'order_rejected', telegramId, planId: order.plan_id, metadata: { orderId: order.id } });
        let userNotifyFailed = false;
        if (order?.user_telegram_id) {
          try {
            await sendMessage(order.user_telegram_id, 'Chekingiz rad etildi. Iltimos, to‘lov ma’lumotlarini tekshirib, qayta urinib ko‘ring yoki admin bilan bog‘laning.', null);
          } catch (error) {
            userNotifyFailed = true;
            console.error('User notify fail on reject', error);
          }
        }
        if (chatId && messageId) {
          const text = `${callbackQuery.message?.text || 'Buyurtma'}\n\n❌ YAKUNIY HOLAT: RAD ETILDI`;
          await editMessage(chatId, messageId, text);
        }
        if (userNotifyFailed) {
          await answerCallbackQuery(callbackQuery.id, 'Buyurtma rad etildi, lekin foydalanuvchiga xabar yuborilmadi.');
        } else {
          await answerCallbackQuery(callbackQuery.id, 'Buyurtma rad etildi.');
        }
        return;
      }
      case 'nav':
        if (payload === 'home' || payload === 'back') {
          const state = await fetchUserState(supabase, telegramId);
          const previous = payload === 'home' ? { screen: 'categories' } : state?.previous || { screen: 'categories' };
          if (previous.screen === 'categories') {
            await showCategories({ supabase, chatId, messageId, telegramId, asEdit: true });
          } else if (previous.screen === 'plans') {
            await showPlans({ supabase, chatId, messageId, telegramId, categoryId: previous.categoryId, parentPlanId: previous.parentPlanId || null });
          } else if (previous.screen === 'plan-detail') {
            await showPlanOrVariants({ supabase, chatId, messageId, telegramId, planId: previous.planId });
          } else {
            await showCategories({ supabase, chatId, messageId, telegramId, asEdit: true });
          }
        }
        break;
      default:
        await answerCallbackQuery(callbackQuery.id, 'Noma’lum amal');
        return;
    }
    await answerCallbackQuery(callbackQuery.id, 'Bajarildi');
  } catch (error) {
    console.error('Callback error', error);
    await answerCallbackQuery(callbackQuery.id, 'Xatolik yuz berdi');
  }
}


async function handleTextCommand({ supabase, message }) {
  const text = String(message.text || '').trim();
  const state = await fetchUserState(supabase, message.from.id);
  if (state?.awaiting_promo && text && !text.startsWith('/')) {
    const items = await listCartItems(supabase, message.from.id);
    const basePrice = items.reduce((sum, item) => sum + Number(item.plan?.price || 0) * Number(item.quantity || 1), 0);
    const result = await validatePromoCode(supabase, text, basePrice);
    if (!result.ok) {
      await sendMessage(message.chat.id, 'Promo kod yaroqsiz yoki muddati tugagan.', null);
      return true;
    }
    await saveUserState(supabase, message.from.id, { ...state, awaiting_promo: false, promo_code: result.promo.code });
    await sendMessage(message.chat.id, `Promo kod qabul qilindi. Chegirma: ${formatAmount(result.discount, 'UZS')}`, null);
    return true;
  }
  if (text === '/balance') {
    const wallet = await getUserBalance(supabase, message.from.id);
    await sendMessage(message.chat.id, balanceText(wallet), null);
    return true;
  }
  if (text === '/referral' || text === '/ref') {
    const botUsername = process.env.BOT_USERNAME || 'santyxnarxbot';
    await sendMessage(message.chat.id, referralText({ telegramId: message.from.id, botUsername }), null);
    return true;
  }
  if (text === '/admin' && isAdminTelegramId(message.from.id)) {
    await sendMessage(message.chat.id, '<b>Telegram admin panel</b>\n\n/orders - Orders\n/payments - Payments\n/inventory - Inventory\n/users - Users\n/promos - Promo Codes\n/referrals - Referral System\n/stats - Statistics\n/broadcast - Broadcast Messages\n/settings - Settings', null);
    return true;
  }
  return false;
}

async function handleStart({ supabase, message }) {
  await upsertUser(supabase, message.from);
  const ref = String(message.text || '').match(/^\/start\s+ref_(\d+)/);
  if (ref && ref[1] !== String(message.from.id)) {
    await createAuditLog(supabase, { user_telegram_id: message.from.id, action: 'referral_registered', status: 'created', metadata: { referrer: ref[1] } });
  }
  await trackEvent(supabase, { eventType: 'start_used', telegramId: message.from.id });
  await showCategories({ supabase, chatId: message.chat.id, telegramId: message.from.id, asEdit: false });
}

module.exports = {
  handleStart,
  handleCallback,
  handleReceipt,
  handleTextCommand,
};
