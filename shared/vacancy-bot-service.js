// Vakansiya moduli uchun bot fayl almashinuvi.
// Ikki yo'nalish:
//   1. Mijoz → bot → montajor  (isxodnik materiallar, order materials_pending da)
//   2. Montajor → bot → mijoz  (tayyor fayl, order completed + worker_paid dan keyin)
//
// Fayllar hech qayerga yuklanmaydi — Telegram xabarining manzili saqlanadi va
// keyin copyMessage bilan ko'chiriladi (yuklab olinadigan holda yetadi).

const { request } = require('./db');
const { sendMessage, copyMessage } = require('./telegram');

// Bot qaysi turdagi xabarlarni fayl deb hisoblaydi.
function extractMediaKind(message = {}) {
  if (message.photo) return 'photo';
  if (message.video) return 'video';
  if (message.document) return 'document';
  if (message.audio) return 'audio';
  if (message.voice) return 'voice';
  if (message.video_note) return 'video_note';
  if (message.animation) return 'animation';
  return null;
}

// Mijoz materiallarni yuborayotgan order (bittadan ortiq bo'lsa — eng eskisi).
async function findMaterialsOrder(supabase, telegramId) {
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=*&client_id=eq.${encodeURIComponent(telegramId)}&status=eq.materials_pending&order=created_at.asc&limit=1`,
  }).catch(() => ({ data: [] }));
  return data?.[0] || null;
}

// Montajor yakuniy faylni yuborayotgan order: to'lov o'tkazilgan, fayl hali ketmagan.
async function findFinalDeliveryOrder(supabase, telegramId) {
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=*&worker_user_id=eq.${encodeURIComponent(telegramId)}&status=eq.completed&worker_paid=eq.true&final_file_sent=eq.false&order=created_at.asc&limit=1`,
  }).catch(() => ({ data: [] }));
  return data?.[0] || null;
}

async function storePendingFile(supabase, { order, message, kind }) {
  await request(supabase, 'vacancy_pending_files', {
    method: 'POST',
    body: {
      order_id: order.id,
      sender_id: String(message.from.id),
      tg_chat_id: String(message.chat.id),
      tg_message_id: message.message_id,
      kind,
    },
  });
}

async function countPendingFiles(supabase, orderId, kind) {
  const { data } = await request(supabase, 'vacancy_pending_files', {
    query: `select=id&order_id=eq.${orderId}&kind=eq.${kind}&forwarded=eq.false`,
  }).catch(() => ({ data: [] }));
  return (data || []).length;
}

// Webhook chaqiradi. `true` qaytarsa — xabar vakansiya oqimiga tegishli va
// do'kon mantiqi (chek qabul qilish) ishga tushmasligi kerak.
async function handleVacancyFileRelay({ supabase, message }) {
  const kind = extractMediaKind(message);
  if (!kind) return false; // matn xabarlari — do'kon mantiqiga tegishli
  const telegramId = String(message.from?.id || '');
  if (!telegramId) return false;

  // 1) Mijozning isxodnik materiallari
  const materialsOrder = await findMaterialsOrder(supabase, telegramId);
  if (materialsOrder) {
    await storePendingFile(supabase, { order: materialsOrder, message, kind: 'material' });
    const total = await countPendingFiles(supabase, materialsOrder.id, 'material');
    await sendMessage(
      telegramId,
      `Fayl qabul qilindi (${total} ta).\n\nHammasini yuborib bo'lgach, Mini App'da <b>"Materiallarni jo'natdim ✓"</b> tugmasini bosing.`,
    ).catch(() => null);
    return true;
  }

  // 2) Montajorning yakuniy fayli
  const deliveryOrder = await findFinalDeliveryOrder(supabase, telegramId);
  if (deliveryOrder) {
    const copied = await copyMessage(
      deliveryOrder.client_id,
      message.chat.id,
      message.message_id,
      `Order #${deliveryOrder.id} — tayyor ish`,
    ).catch((e) => {
      console.warn('final file copy warn:', e?.message);
      return null;
    });

    if (!copied) {
      await sendMessage(telegramId, 'Faylni mijozga yuborib bo‘lmadi. Admin bilan bog‘laning.').catch(() => null);
      return true;
    }

    await request(supabase, 'freelance_orders', {
      method: 'PATCH',
      query: `id=eq.${deliveryOrder.id}`,
      body: { final_file_sent: true, updated_at: new Date().toISOString() },
    }).catch(() => null);

    await sendMessage(telegramId, `Fayl mijozga yuborildi. Order #${deliveryOrder.id} yopildi.`).catch(() => null);
    await sendMessage(
      deliveryOrder.client_id,
      `<b>Order #${deliveryOrder.id} — tayyor ish yuborildi!</b>\n\nFaylni yuqorida topasiz. Hamkorlik uchun rahmat!`,
    ).catch(() => null);
    return true;
  }

  return false; // vakansiya oqimiga aloqasi yo'q
}

// Mijoz "Materiallarni jo'natdim" tugmasini bosgach — saqlangan fayllarni
// montajorga birma-bir ko'chiramiz.
async function forwardPendingMaterials(supabase, order) {
  const { data } = await request(supabase, 'vacancy_pending_files', {
    query: `select=*&order_id=eq.${order.id}&kind=eq.material&forwarded=eq.false&order=id.asc`,
  }).catch(() => ({ data: [] }));

  const files = data || [];
  if (!files.length) return 0;

  await sendMessage(
    order.worker_user_id,
    `<b>Order #${order.id} — isxodnik materiallar</b>\n\n${files.length} ta fayl yuborilmoqda...`,
  ).catch(() => null);

  let sent = 0;
  for (const file of files) {
    const copied = await copyMessage(order.worker_user_id, file.tg_chat_id, file.tg_message_id).catch((e) => {
      console.warn('material copy warn:', e?.message);
      return null;
    });
    if (!copied) continue;
    await request(supabase, 'vacancy_pending_files', {
      method: 'PATCH',
      query: `id=eq.${file.id}`,
      body: { forwarded: true },
    }).catch(() => null);
    sent += 1;
  }

  if (sent < files.length) {
    await sendMessage(
      order.worker_user_id,
      `${files.length} ta fayldan ${sent} tasi yuborildi. Qolgani uchun mijoz bilan chatda bog'laning.`,
    ).catch(() => null);
  }
  return sent;
}

module.exports = { handleVacancyFileRelay, forwardPendingMaterials, extractMediaKind };
