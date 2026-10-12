// Qo'llab-quvvatlash: mijoz botning o'zida yozadi, admin panelda o'qiladi va
// o'sha yerdan javob beriladi (support_messages jadvali).
//
// Oqim:
//   1. Mijoz "💬 Admin bilan yozishish" ni bosadi (bosh menyu, to'lov ekrani,
//      "faol buyurtma yo'q" javobi yoki Mini App → t.me/<bot>?start=support).
//   2. Bot holatga support_mode yozadi va oxirgi buyurtma raqamini biriktiradi
//      (to'lov ekranidan bosilsa — aynan o'sha buyurtma).
//   3. Shu rejimdagi har bir xabar (matn, rasm, fayl) jadvalga yoziladi,
//      adminlarga nusxasi boradi, mijozga "yetkazildi" deyiladi.
//   4. Admin panelda javob yozadi — u mijozga bot orqali boradi.
//
// Migratsiya (2026-10-12_support-messages.sql) qo'llanmagan bo'lsa bot eski
// "Admin bilan bog'lanish" havolasini beradi — hech narsa buzilmaydi.

const { request, toQuery, fetchSettings, fetchUserState, saveUserState } = require('./db');
const { sendMessage, copyMessage, inlineKeyboard } = require('./telegram');
const { escapeHtml } = require('./messages');
const { adminChatIds, userLines } = require('./admin-notify');

// Murojaat rejimi shuncha vaqt jim qolsa o'z-o'zidan tugaydi — mijoz kunlar
// o'tib oddiy narsa yozsa, u eski murojaatga tushib qolmasin.
const SUPPORT_TTL_MS = 12 * 60 * 60 * 1000;
// Mijoz murojaatga biriktiriladigan "oxirgi buyurtma" — shu muddat ichidagisi.
const ORDER_LOOKBACK_DAYS = 60;

function supportLink(settings) {
  const raw = String(settings?.support_link || process.env.SUPPORT_USERNAME || '@support');
  return raw.startsWith('http') ? raw : `https://t.me/${raw.replace('@', '')}`;
}

function supportStartKeyboard(orderId = null) {
  return inlineKeyboard([[{ text: '💬 Admin bilan yozishish', callback_data: orderId ? `support:start:${orderId}` : 'support:start' }]]);
}

const END_KEYBOARD = inlineKeyboard([[{ text: '✅ Murojaatni tugatish', callback_data: 'support:end' }]]);

// Jadval bormi (migratsiya qo'llanganmi) — arzon so'rov.
async function supportTableReady(supabase) {
  try {
    await request(supabase, 'support_messages', { query: 'select=id&limit=1' });
    return true;
  } catch {
    return false;
  }
}

// Berilgan buyurtma (faqat shu mijozniki bo'lsa) yoki oxirgi xaridi.
async function resolveOrder(supabase, telegramId, orderId) {
  const since = new Date(Date.now() - ORDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const query = orderId && /^[0-9a-f-]{36}$/i.test(orderId)
    ? toQuery({ select: 'id,order_number,status', id: `eq.${orderId}`, user_telegram_id: `eq.${telegramId}`, limit: 1 })
    : toQuery({ select: 'id,order_number,status', user_telegram_id: `eq.${telegramId}`, order_type: 'neq.topup', created_at: `gte.${since}`, order: 'created_at.desc', limit: 1 });
  const { data } = await request(supabase, 'orders', { query }).catch(() => ({ data: [] }));
  return data?.[0] || null;
}

async function startSupport({ supabase, chatId, telegramId, orderId = null }) {
  if (!(await supportTableReady(supabase))) {
    const settings = await fetchSettings(supabase).catch(() => null);
    await sendMessage(chatId, '📨 Admin bilan bog‘lanish uchun pastdagi tugmani bosing.', inlineKeyboard([[{ text: '📨 Admin bilan bog‘lanish', url: supportLink(settings) }]]));
    return false;
  }
  const order = await resolveOrder(supabase, telegramId, orderId);
  const state = await fetchUserState(supabase, telegramId).catch(() => ({}));
  await saveUserState(supabase, telegramId, {
    ...state,
    support_mode: true,
    support_order_id: order?.id || null,
    support_order_number: order?.order_number || null,
    support_at: new Date().toISOString(),
  });
  await sendMessage(chatId, [
    '💬 <b>Admin bilan yozishish</b>',
    '',
    'Savolingizni shu yerga yozing — matn, rasm yoki fayl yuborishingiz mumkin. Javob shu chatga keladi.',
    order ? `\n🧾 Buyurtma <b>#${escapeHtml(order.order_number)}</b> avtomatik biriktirildi.` : '',
  ].filter(Boolean).join('\n'), END_KEYBOARD);
  return true;
}

async function endSupport({ supabase, chatId, telegramId, silent = false }) {
  const state = await fetchUserState(supabase, telegramId).catch(() => ({}));
  if (state?.support_mode) {
    await saveUserState(supabase, telegramId, { ...state, support_mode: false, support_order_id: null, support_order_number: null });
  }
  if (!silent) await sendMessage(chatId, '✅ Murojaat yopildi. Yana savol bo‘lsa — /start → «💬 Admin bilan yozishish».', null);
}

// Murojaat rejimidagi xabar. true — xabar shu yerda qayta ishlandi
// (chek yoki buyruq deb qaralmaydi).
async function handleSupportMessage({ supabase, message }) {
  const telegramId = String(message?.from?.id || '');
  if (!telegramId || message.chat?.type !== 'private') return false;
  if (typeof message.text === 'string' && message.text.startsWith('/')) return false;
  const state = await fetchUserState(supabase, telegramId).catch(() => ({}));
  if (!state?.support_mode) return false;
  // Promokod kiritish oqimi ustun (bot "promokodni yozing" deb kutib turibdi)
  if (state.awaiting_promo && message.text) return false;
  if (Date.parse(state.support_at || 0) < Date.now() - SUPPORT_TTL_MS) {
    await saveUserState(supabase, telegramId, { ...state, support_mode: false }).catch(() => {});
    return false;
  }

  const fileId = message.photo?.[message.photo.length - 1]?.file_id || message.document?.file_id
    || message.video?.file_id || message.voice?.file_id || null;
  const fileType = message.photo ? 'photo' : message.document ? 'document' : message.video ? 'video' : message.voice ? 'voice' : null;
  const text = String(message.text || message.caption || '').slice(0, 4000) || null;

  try {
    await request(supabase, 'support_messages', {
      method: 'POST',
      body: {
        user_telegram_id: telegramId,
        direction: 'in',
        text,
        file_id: fileId,
        file_type: fileType,
        order_id: state.support_order_id || null,
        order_number: state.support_order_number || null,
      },
    });
  } catch (error) {
    console.warn('support message save warn:', error?.message);
    const settings = await fetchSettings(supabase).catch(() => null);
    await sendMessage(message.chat.id, 'Xabarni saqlab bo‘lmadi. Iltimos, admin bilan to‘g‘ridan-to‘g‘ri bog‘laning:', inlineKeyboard([[{ text: '📨 Admin bilan bog‘lanish', url: supportLink(settings) }]]));
    return true;
  }
  // Faollik — rejim muddati yangilanadi
  await saveUserState(supabase, telegramId, { ...state, support_at: new Date().toISOString() }).catch(() => {});

  // Adminlarga: kim, qaysi buyurtma + xabarning o'zi (nusxa)
  const settings = await fetchSettings(supabase).catch(() => null);
  const header = [
    '💬 <b>Yangi murojaat</b>',
    ...userLines(message.from),
    state.support_order_number ? `🧾 Buyurtma: <b>#${escapeHtml(state.support_order_number)}</b>` : '🧾 Buyurtma: —',
    '',
    'Javob: admin panel → «💬 Murojaatlar».',
  ].join('\n');
  for (const adminId of adminChatIds(settings)) {
    await sendMessage(adminId, header, null).catch(() => {});
    await copyMessage(adminId, message.chat.id, message.message_id).catch(() => {});
  }
  await sendMessage(message.chat.id, '✅ Xabaringiz adminga yetkazildi. Javob shu chatga keladi.', END_KEYBOARD).catch(() => {});
  return true;
}

// Admin paneldan javob: mijozga bot orqali yuboriladi va jadvalga yoziladi.
// Telegram yubora olmasa (mijoz botni bloklagan) — xato qaytadi, yozilmaydi.
async function sendSupportReply(supabase, { telegramId, text, adminName = null }) {
  const body = String(text || '').trim().slice(0, 4000);
  if (!body) throw Object.assign(new Error('Javob matni bo‘sh'), { expose: true, status: 400 });
  const { data: last } = await request(supabase, 'support_messages', {
    query: toQuery({ select: 'order_id,order_number', user_telegram_id: `eq.${telegramId}`, direction: 'eq.in', order: 'created_at.desc', limit: 1 }),
  });
  await sendMessage(String(telegramId), `💬 <b>Admin javobi</b>\n\n${escapeHtml(body)}`, supportStartKeyboard(last?.[0]?.order_id || null));
  // Javob mijozga yetib bordi — tarixga yozilmasa ham xato emas (faqat log)
  const { data } = await request(supabase, 'support_messages', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      user_telegram_id: String(telegramId),
      direction: 'out',
      text: body,
      order_id: last?.[0]?.order_id || null,
      order_number: last?.[0]?.order_number || null,
      admin_name: adminName,
      is_read: true,
    },
  }).catch((error) => { console.warn('support reply save warn:', error?.message); return { data: [] }; });
  return data?.[0] || { direction: 'out', text: body, created_at: new Date().toISOString() };
}

module.exports = {
  startSupport,
  endSupport,
  handleSupportMessage,
  sendSupportReply,
  supportStartKeyboard,
  supportLink,
};
