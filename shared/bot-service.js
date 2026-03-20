const {
  fetchSettings,
  fetchCategories,
  fetchPlansByCategory,
  fetchPlan,
  fetchCategory,
  upsertUser,
  saveUserState,
  fetchUserState,
  trackEvent,
  insertReceiptSubmission,
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
} = require('./messages');

function navButtons(includeMain = true) {
  const row = [];
  if (includeMain) row.push({ text: '🏠 Bosh menyu', callback_data: 'nav:home' });
  row.push({ text: '⬅️ Orqaga', callback_data: 'nav:back' });
  return [row];
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
    [{ text: '💳 To‘lov qilish', callback_data: `pay:${plan.id}` }],
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

async function showPayment({ supabase, chatId, messageId, telegramId, planId }) {
  const [plan, settings] = await Promise.all([fetchPlan(supabase, planId), fetchSettings(supabase)]);
  if (!plan) return;
  await editMessage(chatId, messageId, paymentText(plan, settings), inlineKeyboard([
    [{ text: '📨 Seller bilan bog‘lanish', url: settings?.support_link?.startsWith('http') ? settings.support_link : `https://t.me/${String(settings?.support_link || '@support').replace('@', '')}` }],
    [{ text: '⬅️ Orqaga', callback_data: `plan:${plan.id}` }],
  ]));
  await saveUserState(supabase, telegramId, {
    screen: 'payment',
    categoryId: plan.categoryId,
    planId: plan.id,
    previous: { screen: 'plan-detail', categoryId: plan.categoryId, planId: plan.id },
  });
  await trackEvent(supabase, { eventType: 'payment_opened', telegramId, categoryId: plan.categoryId, planId: plan.id });
}

async function handleReceipt({ supabase, message }) {
  if (!message?.from?.id || !(message.photo || message.document || message.text)) return;
  const state = await fetchUserState(supabase, message.from.id);
  if (!state?.planId) return;

  const [settings, category, plan] = await Promise.all([
    fetchSettings(supabase),
    fetchCategory(supabase, state.categoryId),
    fetchPlan(supabase, state.planId),
  ]);
  const adminChatId = settings?.admin_telegram_id || process.env.ADMIN_TELEGRAM_ID;
  if (!adminChatId) return;

  const caption = receiptForwardCaption({
    fullName: [message.from.first_name, message.from.last_name].filter(Boolean).join(' '),
    username: message.from.username ? `@${message.from.username}` : '-',
    telegramId: message.from.id,
    categoryName: category?.name,
    planName: plan?.name,
    timestamp: new Date(message.date * 1000 || Date.now()).toISOString(),
  });

  await copyMessage(adminChatId, message.chat.id, message.message_id, caption);
  await trackEvent(supabase, {
    eventType: 'receipt_sent',
    telegramId: message.from.id,
    categoryId: state.categoryId,
    planId: state.planId,
    metadata: { messageId: message.message_id },
  });
  await insertReceiptSubmission(supabase, {
    telegram_id: String(message.from.id),
    category_id: state.categoryId,
    plan_id: state.planId,
    telegram_message_id: String(message.message_id),
    payload: message,
  });
  await sendMessage(message.chat.id, 'Chekingiz qabul qilindi ✅\nAdmin tekshiruvdan so‘ng sizga javob beradi.', null);
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
      case 'pay':
        await showPayment({ supabase, chatId, messageId, telegramId, planId: payload });
        break;
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

async function handleStart({ supabase, message }) {
  await upsertUser(supabase, message.from);
  await trackEvent(supabase, { eventType: 'start_used', telegramId: message.from.id });
  await showCategories({ supabase, chatId: message.chat.id, telegramId: message.from.id, asEdit: false });
}

module.exports = {
  handleStart,
  handleCallback,
  handleReceipt,
};
