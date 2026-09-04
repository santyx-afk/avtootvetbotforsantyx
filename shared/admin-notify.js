// Adminlarga bot orqali pul hodisalari haqida xabar berish.
//
// Bitta joyda: mijozga bosiladigan havola, "yangi buyurtma" xabari (inline
// "To'lov keldi" tugmasi bilan) va o'sha xabarni keyin yangilash (to'lov keldi,
// muddat o'tdi, bekor qilindi). Xabar qaysi chatga qaysi message_id bilan
// ketgani audit_logs'da saqlanadi — alohida jadval kerak emas.
//
// Barcha funksiyalar best-effort: xabar ketmasa buyurtma oqimi to'xtamaydi.

const { escapeHtml } = require('./messages');

const NOTIFY_ACTION = 'admin_order_notified';

function adminChatIds(settings) {
  return [
    ...new Set(
      [
        settings?.admin_telegram_id,
        process.env.ADMIN_CHAT_ID,
        process.env.ADMIN_TELEGRAM_ID,
        ...(process.env.ADMIN_TELEGRAM_IDS || '').split(','),
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  ];
}

// Settings'dagi admin ID ham, env'dagilar ham admin hisoblanadi.
// (db.isAdminTelegramId faqat env'ni tekshiradi — settings'dagi ID
// panelda o'rnatiladi, uni ham tan olish kerak.)
function isAdminChat(settings, telegramId) {
  const id = String(telegramId || '').trim();
  return Boolean(id) && adminChatIds(settings).includes(id);
}

function displayName(user = {}) {
  const full = user.full_name
    || [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.username) return `@${user.username}`;
  return String(user.telegram_id || user.id || 'Mijoz');
}

// Bosiladigan mijoz havolasi. Username bo'lsa t.me (chat darhol ochiladi),
// aks holda tg://user?id (profil kartasi). Telegram HTML rejimida ikkalasi ishlaydi.
function userLink(user = {}) {
  const id = String(user.telegram_id || user.id || '').trim();
  const name = escapeHtml(displayName(user));
  if (user.username) return `<a href="https://t.me/${encodeURIComponent(user.username)}">${name}</a>`;
  if (id) return `<a href="tg://user?id=${id}">${name}</a>`;
  return name;
}

// Admin xabarlaridagi mijoz bloki: havola, username, telefon, ID.
function userLines(user = {}) {
  const id = String(user.telegram_id || user.id || '').trim();
  const lines = [`👤 Mijoz: ${userLink(user)}${user.username ? ` (@${escapeHtml(user.username)})` : ''}`];
  if (user.phone) lines.push(`📞 ${escapeHtml(user.phone)}`);
  if (id) lines.push(`🆔 <code>${escapeHtml(id)}</code>`);
  return lines;
}

function formatUzs(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} UZS`;
}

function tashkentTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return String(value);
  }
}

async function fetchUserBrief(supabase, telegramId) {
  const id = String(telegramId || '').trim();
  if (!id) return { telegram_id: '' };
  try {
    const { request } = require('./db');
    const { data } = await request(supabase, 'users', {
      query: `select=telegram_id,username,full_name,phone&telegram_id=eq.${encodeURIComponent(id)}&limit=1`,
    });
    return data?.[0] || { telegram_id: id };
  } catch {
    return { telegram_id: id };
  }
}

// Barcha adminlarga bitta xabar. Qaytaradi: yuborilgan xabarlar ro'yxati
// (chat_id + message_id) — keyin tahrirlash uchun.
async function notifyAdmins(supabase, text, replyMarkup = null, { settings } = {}) {
  const { fetchSettings } = require('./db');
  const { sendMessage } = require('./telegram');
  const cfg = settings === undefined ? await fetchSettings(supabase).catch(() => null) : settings;
  const sent = [];
  for (const chatId of adminChatIds(cfg)) {
    try {
      const result = await sendMessage(chatId, text, replyMarkup);
      sent.push({ chat_id: String(chatId), message_id: result?.message_id });
    } catch (error) {
      console.warn('admin notify warn:', chatId, error?.message);
    }
  }
  return sent;
}

// Qo'lda tasdiqlash mumkinmi: faqat to'lov kutilayotgan va muddati o'tmagan
// buyurtma. Tugma va panel bir xil qoidaga tayanadi.
function canMarkPaid(order, now = Date.now()) {
  if (!order) return { ok: false, reason: 'not_found' };
  if (!['waiting_payment', 'pending_payment'].includes(String(order.status || ''))) {
    return { ok: false, reason: 'invalid_status' };
  }
  if (order.expires_at && new Date(order.expires_at).getTime() < now) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

// "Yangi buyurtma" xabari matni. kind: 'purchase' | 'topup' | 'balance'
// (balance — to'liq balansdan to'langan, to'lov kutilmaydi).
function orderNotificationText({ order, items = [], user = {}, kind = 'purchase', extraLines = [] }) {
  const number = escapeHtml(order?.order_number || '-');
  const amount = Number(order?.unique_price || order?.amount || 0);
  const lines = [];
  if (kind === 'topup') lines.push(`💳 <b>Balans to‘ldirish so‘rovi #${number}</b>`);
  else if (kind === 'balance') lines.push(`💰 <b>Balansdan to‘liq to‘landi #${number}</b>`);
  else lines.push(`🛒 <b>Yangi buyurtma #${number}</b>`);
  lines.push('');
  lines.push(...userLines(user));

  if (items.length) {
    lines.push('');
    for (const item of items) {
      const name = item.plan?.name || item.name || 'Mahsulot';
      lines.push(`📦 ${escapeHtml(name)} × ${Number(item.quantity || 1)}`);
    }
  }
  lines.push('');
  if (kind === 'topup') {
    lines.push(`💰 Kutilayotgan to‘lov: <b>${formatUzs(amount)}</b>`);
    if (order?.topup_credit != null) lines.push(`➕ Balansga tushadi: ${formatUzs(order.topup_credit)}`);
  } else if (kind === 'balance') {
    lines.push(`💰 Summa: <b>${formatUzs(order?.balance_used || order?.base_price)}</b> (balansdan)`);
  } else {
    lines.push(`💰 Kutilayotgan to‘lov: <b>${formatUzs(amount)}</b>`);
    const base = Number(order?.base_price || 0);
    if (base && base !== amount) lines.push(`🏷 Asl narx: ${formatUzs(base)}`);
    if (Number(order?.discount_amount || 0) > 0) lines.push(`🎟 Promokod ${escapeHtml(order.promo_code || '')}: −${formatUzs(order.discount_amount)}`);
    if (Number(order?.balance_used || 0) > 0) lines.push(`👛 Balansdan: −${formatUzs(order.balance_used)}`);
  }
  if (kind !== 'balance' && order?.expires_at) {
    lines.push(`⏳ Muddat: ${escapeHtml(tashkentTime(order.expires_at))} gacha (Toshkent)`);
  }
  for (const extra of extraLines) if (extra) lines.push(escapeHtml(extra));
  return lines.join('\n');
}

function orderNotificationKeyboard(order) {
  const { inlineKeyboard } = require('./telegram');
  return inlineKeyboard([
    [{ text: '✅ To‘lov keldi — tasdiqlash', callback_data: `admin:paid:${order.id}` }],
    [{ text: '❌ Bekor qilish', callback_data: `admin:reject:${order.id}` }],
  ]);
}

// Yangi buyurtma yaratilganda adminlarga xabar (tugmalar bilan) va
// xabar manzillarini audit_logs'ga yozish.
async function notifyNewOrder(supabase, { order, items = [], kind = 'purchase', extraLines = [] }) {
  if (!order?.id) return [];
  try {
    const { createAuditLog } = require('./db');
    const user = await fetchUserBrief(supabase, order.user_telegram_id);
    const text = orderNotificationText({ order, items, user, kind, extraLines });
    const keyboard = kind === 'balance' ? null : orderNotificationKeyboard(order);
    const sent = await notifyAdmins(supabase, text, keyboard);
    if (sent.length && kind !== 'balance') {
      await createAuditLog(supabase, {
        order_id: order.id,
        user_telegram_id: order.user_telegram_id,
        action: NOTIFY_ACTION,
        status: kind,
        metadata: { messages: sent, base_text: text },
      });
    }
    return sent;
  } catch (error) {
    console.warn('notifyNewOrder warn:', error?.message);
    return [];
  }
}

// Buyurtma holati o'zgarganda (to'lov keldi / muddat o'tdi / bekor) yuborilgan
// "yangi buyurtma" xabarlarini tahrirlaydi: tugmalar olib tashlanadi, holat
// qatori qo'shiladi. Xabar topilmasa jim.
async function markOrderNotification(supabase, orderId, statusLine) {
  if (!orderId) return 0;
  try {
    const { request } = require('./db');
    const { editMessage } = require('./telegram');
    const { data } = await request(supabase, 'audit_logs', {
      query: `select=metadata&order_id=eq.${encodeURIComponent(orderId)}&action=eq.${NOTIFY_ACTION}&order=created_at.desc&limit=1`,
    });
    const meta = data?.[0]?.metadata || {};
    const messages = Array.isArray(meta.messages) ? meta.messages : [];
    const baseText = meta.base_text || '';
    let edited = 0;
    for (const m of messages) {
      if (!m?.chat_id || !m?.message_id) continue;
      try {
        await editMessage(m.chat_id, m.message_id, `${baseText}\n\n${statusLine}`, null);
        edited += 1;
      } catch (error) {
        console.warn('order notification edit warn:', error?.message);
      }
    }
    return edited;
  } catch (error) {
    console.warn('markOrderNotification warn:', error?.message);
    return 0;
  }
}

module.exports = {
  adminChatIds,
  isAdminChat,
  userLink,
  userLines,
  displayName,
  fetchUserBrief,
  notifyAdmins,
  canMarkPaid,
  orderNotificationText,
  notifyNewOrder,
  markOrderNotification,
  formatUzs,
  NOTIFY_ACTION,
};
