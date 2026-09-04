const {
  fetchSettings,
  fetchPlan,
  listCartItems,
  createCheckoutOrder,
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
  markOrderPaidManually,
} = require('./db');
const { isAdminChat, markOrderNotification, userLines, formatUzs: formatUzsLabel } = require('./admin-notify');
const { settlePaidOrder } = require('./humo-payment-service');
const { escapeHtml } = require('./messages');
const {
  inlineKeyboard,
  answerCallbackQuery,
  sendMessage,
  editMessage,
  copyMessage,
} = require('./telegram');
const {
  welcomeText,
  receiptAcceptedText,
  noActiveOrderForReceiptText,
  genericOrderErrorText,
  autoPaymentInstructionsText,
  balanceText,
  referralText,
  helpText,
} = require('./messages');
const { processApprovedDelivery } = require('./delivery-service');

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

// Admin tekshiruvi: env'dagi ID lar (isAdminTelegramId) YOKI Sozlamalardagi
// admin_telegram_id. Ilgari faqat env tekshirilardi — panelda o'rnatilgan
// admin bot tugmalarini bosa olmasdi.
async function isAdmin(supabase, telegramId) {
  if (isAdminTelegramId(telegramId)) return true;
  const settings = await fetchSettings(supabase).catch(() => null);
  return isAdminChat(settings, telegramId);
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
const MINI_APP_URL = (process.env.APP_BASE_URL || 'https://santyx.uz').replace(/\/+$/, '');

// Telefon raqamini Telegram orqali ulashish tugmasi (reply keyboard).
// Kontakt xabari webhook'da isOwnContact bilan tekshiriladi — soxtalab
// bo'lmaydi, shuning uchun barcha bonuslar shu qadamga bog'langan.
const CONTACT_KEYBOARD = {
  keyboard: [[{ text: '📱 Raqamni ulashish', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

// Referal havola faqat raqamini tasdiqlaganlarga beriladi (nakrutkaga
// qarshi qo'shimcha to'siq): tasdiqsiz foydalanuvchiga kontakt so'rovi chiqadi.
async function sendReferralInfo({ supabase, chatId, telegramId }) {
  const { request } = require('./db');
  const { data } = await request(supabase, 'users', {
    query: `select=phone_verified_at&telegram_id=eq.${telegramId}&limit=1`,
  });
  if (!data?.[0]?.phone_verified_at) {
    await sendMessage(
      chatId,
      '🤝 Referal havola olish uchun avval telefon raqamingizni ulashing — pastdagi tugmani bosing.',
      CONTACT_KEYBOARD,
    );
    return;
  }
  const settings = await fetchSettings(supabase);
  await sendMessage(chatId, referralText({
    telegramId,
    botUsername: process.env.BOT_USERNAME || 'santyxnarxbot',
    fixedBonus: settings?.referral_fixed_bonus,
    percent: settings?.referral_percent,
  }), null);
}

async function showCategories({ supabase, chatId, messageId, asEdit = false }) {
  const settings = await fetchSettings(supabase);
  const text = `${welcomeText(settings)}\n\n🚀 Barcha obunalarni ko'rish va xarid qilish uchun Mini ilovani oching:`;
  const keyboardRows = [
    [{ text: '🚀 Mini ilovani ochish', web_app: { url: MINI_APP_URL } }],
    // Referal dastur ko'zga tashlansin: Mini App'ga o'tilgach havola faqat
    // Profil ichida qolib, hech kim ishlatmay qo'ygan edi (2026-08-04 dan
    // keyin birorta ham referal kirish bo'lmagan).
    [{ text: '🤝 Do\'st taklif qilish — bonus olish', callback_data: 'show_referral' }],
  ];
  if (asEdit && messageId) {
    return editMessage(chatId, messageId, text, inlineKeyboard(keyboardRows));
  }
  return sendMessage(chatId, text, inlineKeyboard(keyboardRows));
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

  // Reserved inventory OLIB TASHLANDI — stock faqat to'lovdan keyin tekshiriladi.
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
  const from = message.from || {};
  // Mijoz bosiladigan havola bilan — admin darrov profilini ochadi.
  const caption = [
    '🧾 <b>Yangi to‘lov cheki</b>',
    `Buyurtma: <code>#${escapeHtml(order?.order_number || orderId)}</code>`,
    `Summa: ${formatUzsLabel(order?.unique_price || order?.amount || 0)}`,
    ...userLines({
      telegram_id: telegramId,
      username: from.username || null,
      full_name: [from.first_name, from.last_name].filter(Boolean).join(' '),
    }),
  ].join('\n');

  for (const adminId of adminChatIds) {
    try {
      await copyMessage(adminId, message.chat.id, message.message_id, caption);
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
  const isAdminAction = data.startsWith('admin:') || data.startsWith('bc:');
  if (!isAdminAction) answerCallbackQuery(callbackQuery.id).catch(() => {});

  try {
    // Broadcast tugmalari (tasdiqlash / bekor qilish) — broadcast-service'da.
    if (data.startsWith('bc:')) {
      const { handleBroadcastCallback } = require('./broadcast-service');
      await handleBroadcastCallback({ supabase, callbackQuery });
      return;
    }

    // "To'lov keldi" — tizim aniqlamagan to'lovni admin qo'lda tasdiqlaydi
    // (faqat to'lov kutilayotgan va muddati o'tmagan buyurtma).
    if (data.startsWith('admin:paid:')) {
      const orderId = data.replace('admin:paid:', '');
      if (!(await isAdmin(supabase, telegramId))) {
        await answerCallbackQuery(callbackQuery.id, 'Huquq yetarli emas');
        return;
      }
      const res = await markOrderPaidManually(supabase, orderId, telegramId);
      if (!res.ok) {
        const reasons = {
          not_found: 'Buyurtma topilmadi',
          invalid_status: 'Buyurtma to‘lov kutish holatida emas',
          expired: 'Muddat o‘tgan — mijoz qayta buyurtma bersin',
          already_processed: 'Buyurtma allaqachon qayta ishlangan',
        };
        await answerCallbackQuery(callbackQuery.id, reasons[res.reason] || `Xatolik: ${res.reason}`);
        if (res.reason === 'expired') {
          await markOrderNotification(supabase, orderId, '⌛ Muddat o‘tdi — qo‘lda tasdiqlab bo‘lmaydi').catch(() => {});
        }
        return;
      }
      // Javobni darhol beramiz — yetkazish bir necha soniya olishi mumkin.
      await answerCallbackQuery(callbackQuery.id, 'To‘lov qabul qilindi, yetkazilmoqda…').catch(() => {});
      const amount = Number(res.order.unique_price || res.order.amount || 0);
      const adminLabel = callbackQuery.from.username ? `@${callbackQuery.from.username}` : String(telegramId);
      await settlePaidOrder({ supabase, order: res.order, amount, messageKey: res.order.payment_message_id, adminLabel });
      return;
    }

    if (data.startsWith('admin:approve:')) {
      const orderId = data.replace('admin:approve:', '');
      if (!(await isAdmin(supabase, telegramId))) {
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
      if (!(await isAdmin(supabase, telegramId))) {
        await answerCallbackQuery(callbackQuery.id, 'Huquq yetarli emas');
        return;
      }

      const res = await rejectOrder(supabase, orderId);
      if (!res.ok) {
        await answerCallbackQuery(callbackQuery.id, `Xatolik: ${res.reason}`);
        return;
      }

      await editMessage(chatId, messageId, `❌ Buyurtma #${res.order.order_number} rad etildi.`, null);
      // Boshqa adminlardagi "yangi buyurtma" xabarlari ham yangilanadi.
      await markOrderNotification(supabase, orderId, '❌ Bekor qilindi (admin)').catch(() => {});
      await sendMessage(res.order.user_telegram_id, `❌ Buyurtmangiz #${res.order.order_number} rad etildi. Savollar bo'lsa adminga murojaat qiling.`, null);
      await answerCallbackQuery(callbackQuery.id, 'Buyurtma rad etildi');
      return;
    }

    // Start menyusidagi "Do'st taklif qilish" tugmasi: referal havola va shartlar.
    if (data === 'show_referral') {
      await sendReferralInfo({ supabase, chatId, telegramId });
      return;
    }

    // Eski inline katalog oqimi olib tashlandi: har qanday navigatsiya callback'i
    // (nav/category/plan/buy — jumladan eski xabarlardagilar) endi Mini ilova tugmasini ko'rsatadi.
    await showCategories({ supabase, chatId, messageId, asEdit: true });
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
    const planIds = items.map((item) => item.plan?.id).filter(Boolean);
    const result = await validatePromoCode(supabase, text, basePrice, planIds);
    if (!result.ok) {
      await sendMessage(
        message.chat.id,
        result.reason === 'wrong_plan'
          ? 'Bu promo kod savatdagi tovarlarga amal qilmaydi.'
          : 'Promo kod yaroqsiz yoki muddati tugagan.',
        null,
      );
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
    await sendReferralInfo({ supabase, chatId: message.chat.id, telegramId: message.from.id });
    return true;
  }
  if (text === '/help') {
    const settings = await fetchSettings(supabase);
    await sendMessage(message.chat.id, helpText(settings), null);
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
  // Natijasi keyin kerak (telefon so'rash-so'ramaslikni hal qiladi), shuning
  // uchun alohida o'zgaruvchida — lekin baribir qolganlar bilan parallel.
  const userTask = upsertUser(supabase, message.from)
    .catch((e) => { console.warn('upsertUser warn:', e?.message); return null; });
  const tasks = [
    userTask,
    trackEvent(supabase, { eventType: 'start_used', telegramId: message.from.id }).catch(() => {}),
  ];

  const startPayload = String(message.text || '').split(/\s+/)[1] || '';

  // Brauzer orqali login: foydalanuvchiga bir martalik tasdiqlash kodini yuboramiz
  // (uzunligi web-auth-service.js dagi CODE_LENGTH bilan belgilanadi).
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
          const { request } = require('./db');
          // return=representation + ignore-duplicates: yangi qo'shilsa qatorni
          // qaytaradi, mavjud bo'lsa bo'sh — takror ro'yxatga olinmaydi.
          const { data: inserted } = await request(supabase, 'referrals', {
            method: 'POST',
            query: 'on_conflict=referred_telegram_id',
            headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
            body: { referrer_telegram_id: referrerId, referred_telegram_id: referredId, status: 'registered' },
          });
          if (!inserted?.[0]) return; // allaqachon mavjud

          // Signup bonus BU YERDA to'lanmaydi: 2026-08-27 da bitta akkaunt 32
          // soniyada 131 soxta akkaunt bilan 655 000 UZS yig'ib ketdi (akkaunt
          // ochish bepul). Bonus taklif qilingan odam raqamini Telegram orqali
          // TASDIQLAGANDA to'lanadi (telegram-webhook kontakt bo'limi). Raqami
          // avvaldan tasdiqlangan bo'lsa — hoziroq.
          const { data: u } = await request(supabase, 'users', {
            query: `select=phone_verified_at&telegram_id=eq.${referredId}&limit=1`,
          });
          if (u?.[0]?.phone_verified_at) {
            const { payReferralSignupBonus } = require('./referral-service');
            await payReferralSignupBonus(supabase, referredId);
          }
        } catch (error) {
          console.warn('referral signup warn:', error?.message);
        }
      })(),
    );
  }

  tasks.push(showCategories({ supabase, chatId: message.chat.id, asEdit: false }));
  await Promise.all(tasks);

  // Raqami tasdiqlanmagan va hali welcome bonus olmagan foydalanuvchini
  // kontakt ulashishga undaymiz — welcome bonus ham, referal bonusi ham
  // endi faqat shu qadamdan keyin to'lanadi (nakrutkaga qarshi).
  const userRow = (await userTask)?.data?.[0];
  if (userRow && !userRow.phone_verified_at && !userRow.welcome_bonus_at) {
    const settings = await fetchSettings(supabase).catch(() => null);
    const bonus = Math.round(Number(settings?.welcome_bonus || 0));
    const text = bonus > 0
      ? `🎁 <b>Raqamingizni ulashing — ${bonus.toLocaleString('uz-UZ')} UZS bonus!</b>\n\nPastdagi tugma orqali telefon raqamingizni tasdiqlang, bonus darhol balansingizga tushadi.`
      : '📱 Buyurtmalar va bonuslar uchun telefon raqamingizni ulashing — pastdagi tugmani bosing.';
    await sendMessage(message.chat.id, text, CONTACT_KEYBOARD).catch(() => {});
  }
}

module.exports = {
  handleStart,
  handleCallback,
  handleReceipt,
  handleTextCommand,
  showPayment,
};