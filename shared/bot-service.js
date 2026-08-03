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

function addPromoUsageText() {
  return [
    '❌ Format: <code>/addpromo KOD percent|fixed QIYMAT [max:N] [expires:YYYY-MM-DD] [onetime]</code>',
    '',
    'Masalan:',
    '<code>/addpromo SALE10 percent 10</code>',
    '<code>/addpromo SALE10 percent 10 max:5 expires:2025-12-31 onetime</code>',
  ].join('\n');
}

// Ixtiyoriy argumentlar: max:N, expires:YYYY-MM-DD, onetime
function parsePromoOptions(tokens = []) {
  const result = { ok: true, maxUses: null, expiresAt: null, isOneTime: false };
  for (const raw of tokens) {
    const token = String(raw).trim();
    if (!token) continue;
    const lower = token.toLowerCase();

    if (lower === 'onetime' || lower === 'one_time') {
      result.isOneTime = true;
      continue;
    }
    if (lower.startsWith('max:')) {
      const max = parseInt(token.slice(4), 10);
      if (!Number.isFinite(max) || max <= 0) return { ok: false, error: `max noto‘g‘ri: ${token}` };
      result.maxUses = max;
      continue;
    }
    if (lower.startsWith('expires:')) {
      const date = token.slice(8);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: `expires sanasi YYYY-MM-DD ko‘rinishida bo‘lishi kerak: ${token}` };
      const parsed = new Date(`${date}T23:59:59.999Z`);
      // Date 2025-02-30 ni jimgina 2025-03-02 ga aylantiradi, shuning uchun teskari tekshiruv
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        return { ok: false, error: `expires sanasi mavjud emas: ${date}` };
      }
      result.expiresAt = parsed.toISOString();
      continue;
    }
    return { ok: false, error: `Noma’lum parametr: ${token}` };
  }
  // is_one_time hech qayerda tekshirilmaydi, shuning uchun u max_uses=1 orqali kuchga kiradi
  if (result.isOneTime && !result.maxUses) result.maxUses = 1;
  return result;
}


// Bosh menyu: inline katalog o'rniga bitta "Mini ilovani ochish" (WebApp) tugmasi.
const MINI_APP_URL = process.env.APP_BASE_URL || 'https://santyx.uz';

async function showCategories({ supabase, chatId, messageId, telegramId, asEdit = false }) {
  const settings = await fetchSettings(supabase);
  const text = `${welcomeText(settings)}\n\n🚀 Barcha obunalarni ko'rish va xarid qilish uchun Mini ilovani oching:`;
  const keyboardRows = [[{ text: '🚀 Mini ilovani ochish', web_app: { url: MINI_APP_URL } }]];
  if (asEdit && messageId) {
    return editMessage(chatId, messageId, text, inlineKeyboard(keyboardRows));
  }
  return sendMessage(chatId, text, inlineKeyboard(keyboardRows));
}

async function showPlanOrVariants({ supabase, chatId, messageId, telegramId, planId, asEdit = true }) {
  const plan = await fetchPlan(supabase, planId);
  if (!plan) return false;

  const children = await fetchPlansByCategory(supabase, plan.categoryId, plan.id);
  if (children.length > 0) {
    const text = `<b>${plan.name}</b>\n\nVariantni tanlang:`;
    const rows = [
      ...children.map((child) => [{ text: child.name, callback_data: `plan:${child.id}` }]),
      [{ text: '⬅️ Orqaga', callback_data: `category:${plan.categoryId}` }],
    ];
    if (asEdit && messageId) {
      await editMessage(chatId, messageId, text, inlineKeyboard(rows));
    } else {
      await sendMessage(chatId, text, inlineKeyboard(rows));
    }
    return true;
  }

  const text = planDetailText(plan);
  const rows = [
    [{ text: '🛒 Sotib olish', callback_data: `buy:${plan.id}` }],
    [{ text: '⬅️ Orqaga', callback_data: `category:${plan.categoryId}` }],
  ];
  if (asEdit && messageId) {
    await editMessage(chatId, messageId, text, inlineKeyboard(rows));
  } else {
    await sendMessage(chatId, text, inlineKeyboard(rows));
  }
  return true;
}

async function showPayment({ supabase, chatId, telegramId, planId }) {
  // Plan va settings mustaqil — birga olamiz.
  const [plan, settings] = await Promise.all([
    fetchPlan(supabase, planId),
    fetchSettings(supabase),
  ]);
  if (!plan) {
    await sendMessage(chatId, genericOrderErrorText(), null);
    return;
  }

  const order = await createCheckoutOrder(supabase, {
    user_telegram_id: telegramId,
    items: [{ plan_id: plan.id, plan, quantity: 1 }],
  });

  await reserveInventoryForOrder(supabase, order.id);
  await setUserAwaitingReceipt(supabase, telegramId, { current_order_id: order.id });

  const text = autoPaymentInstructionsText({
    order,
    items: [{ plan_id: plan.id, plan, quantity: 1 }],
    settings,
    fallback: {
      cardNumber: process.env.PAYMENT_CARD_NUMBER,
      cardOwner: process.env.PAYMENT_CARD_OWNER,
      support: process.env.SUPPORT_USERNAME,
    },
  });

  const rows = [
    [{ text: '📋 Kartani nusxalash', copy_text: { text: settings?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '' } }],
    [{ text: '📨 Admin bilan bog‘lanish', url: settings?.support_link?.startsWith('http') ? settings.support_link : `https://t.me/${String(settings?.support_link || process.env.SUPPORT_USERNAME || '@support').replace('@', '')}` }],
  ];

  await sendMessage(chatId, text, inlineKeyboard(rows));
}

async function handleReceipt({ supabase, message }) {
  const telegramId = message.from.id;
  const [userState, settings] = await Promise.all([
    fetchUserState(supabase, telegramId),
    fetchSettings(supabase),
  ]);
  if (!userState?.awaiting_receipt || !userState?.current_order_id) {
    await sendMessage(message.chat.id, noActiveOrderForReceiptText(), null);
    return;
  }

  const orderId = userState.current_order_id;
  const adminChatIds = resolveAdminChatIds(settings);

  const fileId = message.photo?.[message.photo.length - 1]?.file_id || message.document?.file_id;
  const fileType = message.photo ? 'photo' : 'document';

  const receiptRecord = await insertReceiptSubmission(supabase, {
    order_id: orderId,
    user_telegram_id: String(telegramId),
    receipt_file_id: fileId,
    receipt_file_type: fileType,
    raw_message_id: message.message_id,
    status: 'payment_uploaded',
  });

  await updateOrderStatus(supabase, orderId, 'payment_uploaded', {
    receipt_submission_id: receiptRecord?.id || null,
    delivery_status: 'checking',
  });

  const order = await getOrderById(supabase, orderId);
  const caption = receiptForwardCaption(order, message.from);

  for (const adminId of adminChatIds) {
    try {
      const forwarded = await copyMessage(adminId, message.chat.id, message.message_id, caption);
      const adminKeyboard = inlineKeyboard([
        [
          { text: '✅ Tasdiqlash', callback_data: `admin:approve:${orderId}` },
          { text: '❌ Rad etish', callback_data: `admin:reject:${orderId}` },
        ],
      ]);
      await sendMessage(adminId, `Buyurtma #${order?.order_number || orderId} bo‘yicha qaror:`, adminKeyboard);
    } catch (err) {
      console.error(`Failed to notify admin ${adminId}:`, err);
    }
  }

  await sendMessage(message.chat.id, receiptAcceptedText(), null);
}

async function handleCallback({ supabase, callbackQuery }) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const telegramId = callbackQuery.from.id;
  const data = String(callbackQuery.data || '');

  // Admin amallar o'z natija matnini o'zi yuboradi; navigatsiya tugmalari uchun esa
  // "yuklanmoqda" belgisini zudlik bilan to'xtatamiz — tugma darhol javob bergandek bo'ladi.
  const isAdminAction = data.startsWith('admin:');
  if (!isAdminAction) answerCallbackQuery(callbackQuery.id).catch(() => {});

  try {
    if (data.startsWith('admin:approve:')) {
      const orderId = data.replace('admin:approve:', '');
      if (!isAdminTelegramId(telegramId)) {
        await answerCallbackQuery(callbackQuery.id, 'Huquq yetarli emas');
        return;
      }

      const res = await approveOrder(supabase, orderId);
      if (!res.ok) {
        await answerCallbackQuery(callbackQuery.id, `Xatolik: ${res.reason}`);
        return;
      }

      const deliveryRes = await processApprovedDelivery({
        supabase,
        order: res.order,
        adminTelegramId: String(callbackQuery.from.id),
      });
      if (!deliveryRes.ok) {
        const reason = deliveryRes.admin_message || deliveryRes.message || deliveryRes.code || 'Noma’lum xatolik';
        await editMessage(chatId, messageId, `⚠️ Buyurtma #${res.order.order_number} tasdiqlandi, lekin yetkazib bo‘lmadi.\n\nSabab: ${reason}`, null);
        await answerCallbackQuery(callbackQuery.id, `Yetkazishda xatolik: ${deliveryRes.code || 'xato'}`);
        return;
      }

      const doneText = deliveryRes.code === 'MANUAL_REQUIRED'
        ? `✅ Buyurtma #${res.order.order_number} tasdiqlandi. Obunani qo‘lda ulash kerak.`
        : `✅ Buyurtma #${res.order.order_number} tasdiqlandi va yetkazildi.`;
      await editMessage(chatId, messageId, doneText, null);
      await sendMessage(res.order.user_telegram_id, `🎉 Buyurtmangiz #${res.order.order_number} tasdiqlandi!`, null);
      await answerCallbackQuery(callbackQuery.id, 'Buyurtma tasdiqlandi');
      return;
    }

    if (data.startsWith('admin:reject:')) {
      const orderId = data.replace('admin:reject:', '');
      if (!isAdminTelegramId(telegramId)) {
        await answerCallbackQuery(callbackQuery.id, 'Huquq yetarli emas');
        return;
      }

      const res = await rejectOrder(supabase, orderId);
      if (!res.ok) {
        await answerCallbackQuery(callbackQuery.id, `Xatolik: ${res.reason}`);
        return;
      }

      await editMessage(chatId, messageId, `❌ Buyurtma #${res.order.order_number} rad etildi.`, null);
      await sendMessage(res.order.user_telegram_id, `❌ Buyurtmangiz #${res.order.order_number} rad etildi. Savollar bo'lsa adminga murojaat qiling.`, null);
      await answerCallbackQuery(callbackQuery.id, 'Buyurtma rad etildi');
      return;
    }

    // Eski inline katalog oqimi olib tashlandi: har qanday navigatsiya callback'i
    // (nav/category/plan/buy — jumladan eski xabarlardagilar) endi Mini ilova tugmasini ko'rsatadi.
    await showCategories({ supabase, chatId, messageId, telegramId, asEdit: true });
    // Navigatsiya javobini boshida berdik — takroriy 'Bajarildi' shart emas.
  } catch (error) {
    console.error('Callback error', error);
    answerCallbackQuery(callbackQuery.id, 'Xatolik yuz berdi').catch(() => {});
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
    await sendMessage(message.chat.id, [
      '<b>Telegram Admin Panel</b>',
      '',
      'Yangi promokod qo\'shish:',
      '<code>/addpromo CODE percent 10</code> (10% chegirma)',
      '<code>/addpromo CODE fixed 5000</code> (5000 UZS chegirma)',
      '',
      'Ixtiyoriy parametrlar:',
      '<code>max:5</code> — nechi marta ishlatilishi mumkin',
      '<code>expires:2025-12-31</code> — shu sanagacha amal qiladi',
      '<code>onetime</code> — bir martalik (max:5 berilmasa max:1)',
      '',
      'To\'liq misol:',
      '<code>/addpromo SALE10 percent 10 max:5 expires:2025-12-31 onetime</code>',
      '',
      'Promokodlar ro\'yxati: /promos',
      'Statistika: /stats',
    ].join('\n'), null);
    return true;
  }
  if (text.startsWith('/addpromo') && isAdminTelegramId(message.from.id)) {
    const parts = text.split(/\s+/);
    if (parts.length < 4) {
      await sendMessage(message.chat.id, addPromoUsageText(), null);
      return true;
    }
    const code = parts[1].toUpperCase();
    const type = parts[2].toLowerCase() === 'percent' ? 'percent' : 'fixed';
    const value = parseFloat(parts[3]);

    if (!value || value <= 0) {
      await sendMessage(message.chat.id, '❌ Qiymat noldan katta bo\'lishi kerak', null);
      return true;
    }
    if (type === 'percent' && value > 100) {
      await sendMessage(message.chat.id, '❌ Foiz chegirma 100 dan oshmasligi kerak', null);
      return true;
    }

    const options = parsePromoOptions(parts.slice(4));
    if (!options.ok) {
      await sendMessage(message.chat.id, `❌ ${options.error}\n\n${addPromoUsageText()}`, null);
      return true;
    }

    const { insertRow } = require('./db');
    await insertRow(supabase, 'promo_codes', {
      code,
      discount_type: type,
      discount_value: value,
      is_one_time: options.isOneTime,
      max_uses: options.maxUses,
      expires_at: options.expiresAt,
      is_active: true,
      used_count: 0
    });

    const details = [
      `✅ Promokod yaratildi:`,
      `<b>Kod:</b> ${code}`,
      `<b>Turi:</b> ${type === 'percent' ? '%' : 'UZS'}`,
      `<b>Qiymati:</b> ${value}`,
      `<b>Limit:</b> ${options.maxUses ? `${options.maxUses} marta` : 'cheksiz'}`,
      `<b>Amal qiladi:</b> ${options.expiresAt ? String(options.expiresAt).slice(0, 10) + ' gacha' : 'muddatsiz'}`,
      `<b>Bir martalik:</b> ${options.isOneTime ? 'ha' : 'yo\'q'}`,
    ];
    await sendMessage(message.chat.id, details.join('\n'), null);
    return true;
  }
  if (text === '/promos' && isAdminTelegramId(message.from.id)) {
    // listTable sort_order bo'yicha saralaydi, promo_codes da bunday ustun yo'q
    const { request } = require('./db');
    const promos = await request(supabase, 'promo_codes', { query: 'select=*&order=created_at.desc' })
      .then((res) => res.data || [])
      .catch(() => []);
    if (!promos || promos.length === 0) {
      await sendMessage(message.chat.id, 'Hozircha promokodlar yo\'q', null);
      return true;
    }
    const msg = promos.map((p) => {
      const usage = p.max_uses ? `${p.used_count || 0}/${p.max_uses}` : `${p.used_count || 0}`;
      const extras = [
        `Ishlatildi: ${usage}`,
        p.expires_at ? `Muddat: ${String(p.expires_at).slice(0, 10)}` : null,
        p.is_one_time ? 'bir martalik' : null,
        p.is_active === false ? 'o‘chirilgan' : null,
      ].filter(Boolean).join(', ');
      return `• <b>${p.code}</b>: ${p.discount_value}${p.discount_type === 'percent' ? '%' : ' UZS'} (${extras})`;
    }).join('\n');
    await sendMessage(message.chat.id, `<b>Mavjud Promokodlar:</b>\n\n${msg}`, null);
    return true;
  }
  return false;
}

async function handleStart({ supabase, message }) {
  // Bookkeeping (foydalanuvchi, analitika, referal) ni kategoriyalarni ko'rsatish
  // bilan PARALLEL bajaramiz. Promise.all barcha yozuvlarni kutadi (serverless'da
  // yo'qolmaydi), lekin ketma-ket emas — shuning uchun user tezroq javob oladi.
  const tasks = [
    upsertUser(supabase, message.from).catch((e) => console.warn('upsertUser warn:', e?.message)),
    trackEvent(supabase, { eventType: 'start_used', telegramId: message.from.id }).catch(() => {}),
  ];

  const startPayload = String(message.text || '').split(/\s+/)[1] || '';

  // Brauzer orqali login: foydalanuvchiga 6 xonali tasdiqlash kodini yuboramiz.
  if (startPayload === 'web_login') {
    const { generateWebLoginCode } = require('./web-auth-service');
    tasks.push(
      generateWebLoginCode(supabase, message.from.id)
        .then((code) =>
          sendMessage(
            message.chat.id,
            ['🔐 <b>Saytga kirish kodi</b>', '', `Kod: <code>${code}</code>`, '', 'Shu kodni brauzerdagi saytga kiriting. Kod 5 daqiqa ichida amal qiladi.'].join('\n'),
            null,
          ),
        )
        .catch((e) => console.warn('web_login code warn:', e?.message)),
    );
  }

  const ref = String(message.text || '').match(/^\/start\s+ref_(\d+)/);
  if (ref && ref[1] !== String(message.from.id)) {
    const referrerId = ref[1];
    const referredId = String(message.from.id);
    tasks.push(
      createAuditLog(supabase, { user_telegram_id: referredId, action: 'referral_registered', status: 'created', metadata: { referrer: referrerId } }).catch(() => {}),
      (async () => {
        try {
          const { request, addWalletTransaction } = require('./db');
          // return=representation + ignore-duplicates: yangi qo'shilsa qatorni qaytaradi,
          // mavjud bo'lsa bo'sh => signup bonus takror berilmaydi.
          const { data } = await request(supabase, 'referrals', {
            method: 'POST',
            query: 'on_conflict=referred_telegram_id',
            headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
            body: { referrer_telegram_id: referrerId, referred_telegram_id: referredId, status: 'registered' },
          });
          if (!data?.[0]) return; // allaqachon mavjud

          // Signup bonus: referal havola orqali yangi foydalanuvchi qo'shilganda referrerga
          const settings = await fetchSettings(supabase).catch(() => null);
          const signupBonus = Number(settings?.referral_fixed_bonus || 0);
          if (signupBonus > 0) {
            await addWalletTransaction(supabase, {
              user_telegram_id: referrerId,
              amount: signupBonus,
              type: 'referral',
              description: `Referal signup bonus (#${referredId})`,
            });
            await request(supabase, 'referrals', {
              method: 'PATCH',
              query: `referred_telegram_id=eq.${referredId}`,
              body: { total_earned: signupBonus, updated_at: new Date().toISOString() },
            }).catch(() => {});
            await sendMessage(referrerId, `🎉 Sizning referal havolangiz orqali yangi foydalanuvchi qo'shildi! +${signupBonus.toLocaleString('uz-UZ')} UZS`).catch(() => {});
          }
        } catch (error) {
          console.warn('referral signup warn:', error?.message);
        }
      })(),
    );
  }

  tasks.push(showCategories({ supabase, chatId: message.chat.id, telegramId: message.from.id, asEdit: false }));
  await Promise.all(tasks);
}

module.exports = {
  handleStart,
  handleCallback,
  handleReceipt,
  handleTextCommand,
  showPayment,
};