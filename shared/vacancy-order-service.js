// Vakansiya (freelance) orderlari uchun umumiy flow logikasi.
// vacancy-api (foydalanuvchi amallari), humo-payment-service (to'lov aniqlash) va
// vacancy-deadline-check (rejalashtirilgan tekshiruv) shu moduldan foydalanadi.

const { request } = require('./db');
const { sendMessage } = require('./telegram');

const FIRST_PAYMENT_WINDOW_MS = 10 * 60 * 1000; // 10 daqiqa
const FINAL_PAYMENT_WINDOW_MS = 72 * 60 * 60 * 1000; // 3 kun
const DEADLINE_WARNING_RATIO = 0.2; // 20% vaqt qolganda ogohlantirish
const MAX_DEADLINE_VIOLATIONS = 3;
const BAN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const COMMISSION_RATE = 0.1; // platforma komissiyasi — 10%

function formatUzs(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Number(value || 0))} UZS`;
}

// Order pul taqsimoti. Yaxlitlash tufayli tiyin yo'qolmasligi uchun ikkinchi
// bo'lak ayirma orqali hisoblanadi (first + second === amount har doim).
function calculateOrderMoney(rawAmount) {
  const amount = Math.round(Number(rawAmount) || 0);
  const commission = Math.round(amount * COMMISSION_RATE);
  const firstPayment = Math.round(amount * 0.5);
  return {
    amount,
    commission,
    worker_amount: amount - commission,
    first_payment: firstPayment,
    second_payment: amount - firstPayment,
  };
}

// 3 kunlik muddat o'tib qolgan to'lov kelmasa: ushlab qolingan 50% dan
// komissiya olinadi, qolgani ishchiga to'lanadi.
function workerShareOnTimeout(order) {
  return Number(order.first_payment || 0) - Number(order.commission || 0);
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function adminChatIds() {
  return [
    ...new Set(
      [process.env.ADMIN_CHAT_ID, process.env.ADMIN_TELEGRAM_ID, ...(process.env.ADMIN_TELEGRAM_IDS || '').split(',')]
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  ];
}

async function notifyAdmins(text) {
  for (const chatId of adminChatIds()) {
    await sendMessage(chatId, text).catch((e) => console.warn('vacancy admin notify warn:', e?.message));
  }
}

async function patchOrder(supabase, orderId, patch) {
  const { data } = await request(supabase, 'freelance_orders', {
    method: 'PATCH',
    query: `id=eq.${Number(orderId)}`,
    body: { ...patch, updated_at: new Date().toISOString() },
    headers: { Prefer: 'return=representation' },
  });
  return data?.[0] || null;
}

// Chatga tizim xabari qo'shadi (order holati o'zgarganda ko'rinadi).
async function insertSystemMessage(supabase, chatId, content, senderId = 'system') {
  const { data } = await request(supabase, 'chat_messages', {
    method: 'POST',
    body: { chat_id: chatId, sender_id: String(senderId), message_type: 'system', content },
    headers: { Prefer: 'return=representation' },
  }).catch(() => ({ data: [] }));
  await request(supabase, 'chats', {
    method: 'PATCH',
    query: `id=eq.${chatId}`,
    body: { last_message_at: new Date().toISOString() },
  }).catch(() => null);
  return data?.[0] || null;
}

// HumoCardBot to'lovni summa bo'yicha topadi — band summa do'kon buyurtmalari
// bilan ham to'qnashmasligi kerak, shuning uchun ikkala jadval tekshiriladi.
async function generateVacancyUniquePrice(supabase, basePrice) {
  const base = Math.floor(Number(basePrice || 0));
  const [shopRes, vacancyRes] = await Promise.all([
    request(supabase, 'orders', {
      query: 'select=unique_price&status=in.(waiting_payment,pending_payment)&unique_price=not.is.null',
    }).catch(() => ({ data: [] })),
    request(supabase, 'freelance_orders', {
      query: 'select=unique_price&status=in.(payment_pending,final_payment_pending)&unique_price=not.is.null',
    }).catch(() => ({ data: [] })),
  ]);
  const reserved = new Set(
    [...(shopRes.data || []), ...(vacancyRes.data || [])].map((row) => Number(row.unique_price)),
  );
  const start = Math.floor(Math.random() * 999) + 1;
  for (let i = 0; i < 999; i += 1) {
    const candidate = base + (((start + i - 1) % 999) + 1);
    if (!reserved.has(candidate)) return candidate;
  }
  return null;
}

// To'lov oynasini ochadi: noyob summa + muddat.
async function openPaymentWindow(supabase, order, stage) {
  const baseAmount = stage === 'first' ? order.first_payment : order.second_payment;
  const uniquePrice = await generateVacancyUniquePrice(supabase, baseAmount);
  if (!uniquePrice) return null;

  const windowMs = stage === 'first' ? FIRST_PAYMENT_WINDOW_MS : FINAL_PAYMENT_WINDOW_MS;
  return patchOrder(supabase, order.id, {
    status: stage === 'first' ? 'payment_pending' : 'final_payment_pending',
    payment_stage: stage,
    unique_price: uniquePrice,
    payment_expires_at: new Date(Date.now() + windowMs).toISOString(),
  });
}

// Deadline taymerini boshlaydi va statusni in_progress ga o'tkazadi.
async function startWork(supabase, order, extraPatch = {}) {
  const deadlineAt = new Date(Date.now() + Number(order.deadline_hours) * 60 * 60 * 1000).toISOString();
  return patchOrder(supabase, order.id, {
    status: 'in_progress',
    deadline_at: deadlineAt,
    deadline_warning_sent: false,
    deadline_expired: false,
    ...extraPatch,
  });
}

// Deadline buzilishi hisoblagichi: 1 — ogohlantirish, 2 — reyting -0.5, 3 — 7 kunlik ban.
async function applyDeadlinePenalty(supabase, order) {
  const { data } = await request(supabase, 'workers', {
    query: `select=*&user_id=eq.${encodeURIComponent(order.worker_user_id)}&limit=1`,
  }).catch(() => ({ data: [] }));
  const worker = data?.[0];
  if (!worker) return;

  const violations = Number(worker.deadline_violations || 0) + 1;
  const patch = { deadline_violations: violations, updated_at: new Date().toISOString() };
  let notice = `⚠️ <b>Ogohlantirish</b>\n\nOrder #${order.id} bo'yicha deadline buzildi (${violations}-marta).`;

  if (violations === 2) {
    patch.avg_rating = Math.max(0, Number(worker.avg_rating || 0) - 0.5);
    notice += '\n\nReytingingiz 0.5 ball tushirildi.';
  } else if (violations >= MAX_DEADLINE_VIOLATIONS) {
    patch.is_banned = true;
    patch.ban_reason = '3 marta deadline buzilishi';
    patch.banned_until = new Date(Date.now() + BAN_DURATION_MS).toISOString();
    notice = `🚫 <b>Hisobingiz 7 kunga to'xtatildi</b>\n\nSiz 3 marta deadline buzganingiz uchun vaqtincha to'xtatildingiz.`;
  }

  await request(supabase, 'workers', { method: 'PATCH', query: `id=eq.${worker.id}`, body: patch }).catch(() => null);
  await sendMessage(order.worker_user_id, notice).catch(() => null);
}

/* ---------------- To'lov aniqlash (HumoCardBot) ---------------- */

// Aniqlangan summaga mos vakansiya orderini topadi va statusni oldinga suradi.
// Do'kon buyurtmasi topilmagan holatda humo-payment-service shu funksiyani chaqiradi.
async function matchVacancyPayment({ supabase, amount, messageKey }) {
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=*&unique_price=eq.${Number(amount)}&status=in.(payment_pending,final_payment_pending)&order=created_at.asc&limit=1`,
  }).catch(() => ({ data: [] }));

  const order = data?.[0];
  if (!order) return { matched: false };

  return order.payment_stage === 'second'
    ? confirmFinalPayment({ supabase, order, messageKey })
    : confirmFirstPayment({ supabase, order, messageKey });
}

// 50% to'landi → isxodnik kerak bo'lsa material kutamiz, aks holda ish boshlanadi.
async function confirmFirstPayment({ supabase, order, messageKey }) {
  const paidPatch = {
    first_payment_status: 'paid',
    first_paid_at: new Date().toISOString(),
    unique_price: null,
    payment_stage: null,
    payment_expires_at: null,
  };

  let updated;
  if (order.has_source_materials) {
    updated = await patchOrder(supabase, order.id, { ...paidPatch, status: 'materials_pending' });
    await insertSystemMessage(
      supabase,
      order.chat_id,
      `✅ 50% to'lov qabul qilindi (${formatUzs(order.first_payment)}). Isxodnik materiallarni botga yuboring.`,
    );
    await sendMessage(
      order.client_id,
      `✅ <b>To'lov qabul qilindi!</b>\n\nOrder #${order.id}\n💰 ${formatUzs(order.first_payment)} (50%)\n\n📦 Endi isxodnik materiallarni shu botga yuboring, so'ng Mini App'da "Materiallarni jo'natdim" tugmasini bosing.`,
    ).catch(() => null);
    await sendMessage(
      order.worker_user_id,
      `✅ Order #${order.id} bo'yicha 50% to'lov qabul qilindi. Mijoz materiallarni yuborishi kutilmoqda.`,
    ).catch(() => null);
  } else {
    updated = await startWork(supabase, { ...order, ...paidPatch }, paidPatch);
    await insertSystemMessage(
      supabase,
      order.chat_id,
      `✅ 50% to'lov qabul qilindi (${formatUzs(order.first_payment)}). Ish boshlandi — deadline: ${formatDateTime(updated.deadline_at)}`,
    );
    await sendMessage(
      order.client_id,
      `✅ <b>To'lov qabul qilindi!</b>\n\nOrder #${order.id}\n💰 ${formatUzs(order.first_payment)} (50%)\n⏰ Deadline: ${formatDateTime(updated.deadline_at)}`,
    ).catch(() => null);
    await sendMessage(
      order.worker_user_id,
      `✅ <b>To'lov qabul qilindi!</b>\n\nOrder #${order.id} — ish boshlandi.\n⏰ Deadline: ${formatDateTime(updated.deadline_at)}`,
    ).catch(() => null);
  }

  await notifyAdmins(
    `💼 <b>Vakansiya to'lovi</b>\n\nOrder #${order.id} — 50%\n💰 ${formatUzs(order.unique_price)}\nMijoz: <code>${order.client_id}</code>`,
  );
  return { matched: true, vacancy: true, order: updated, messageKey };
}

// Qolgan 50% to'landi → order yakunlandi, admin ishchiga qo'lda to'laydi.
async function confirmFinalPayment({ supabase, order, messageKey }) {
  const updated = await patchOrder(supabase, order.id, {
    status: 'completed',
    second_payment_status: 'paid',
    second_paid_at: new Date().toISOString(),
    unique_price: null,
    payment_stage: null,
    payment_expires_at: null,
  });

  await insertSystemMessage(supabase, order.chat_id, `🎉 Order #${order.id} yakunlandi — to'lov to'liq qabul qilindi.`);
  await sendMessage(
    order.client_id,
    `🎉 <b>Order #${order.id} yakunlandi!</b>\n\nTo'lov to'liq qabul qilindi. Tayyor fayl tez orada yuboriladi.`,
  ).catch(() => null);
  await sendMessage(
    order.worker_user_id,
    `🎉 <b>Order #${order.id} yakunlandi!</b>\n\nMijoz qolgan to'lovni amalga oshirdi.\n💰 Sizga to'lanadi: ${formatUzs(order.worker_amount)}\n\nAdmin tez orada o'tkazadi.`,
  ).catch(() => null);

  const { data } = await request(supabase, 'workers', {
    query: `select=card_number&user_id=eq.${encodeURIComponent(order.worker_user_id)}&limit=1`,
  }).catch(() => ({ data: [] }));

  await notifyAdmins(
    `🎉 <b>Order #${order.id} muvaffaqiyatli yakunlandi!</b>\n\n` +
      `💰 Umumiy summa: ${formatUzs(order.amount)}\n` +
      `💼 Komissiya (10%): ${formatUzs(order.commission)}\n` +
      `👷 Montajorga: ${formatUzs(order.worker_amount)}\n` +
      `💳 Montajor kartasi: <code>${data?.[0]?.card_number || '—'}</code>\n\n` +
      `Admin panel → Vakansiya orderlari → "To'landi"`,
  );
  return { matched: true, vacancy: true, order: updated, messageKey };
}

/* ---------------- Rejalashtirilgan tekshiruvlar ---------------- */

// Muddati o'tgan to'lov oynalarini yopadi.
// 50% oyna (10 daq) — order bekor qilinadi.
// Qolgan 50% oyna (3 kun) — order bekor, 50% dan 10% komissiya olinib, 40% ishchiga.
async function expirePaymentWindows(supabase) {
  const now = new Date().toISOString();
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=*&status=in.(payment_pending,final_payment_pending)&payment_expires_at=lt.${now}&limit=50`,
  }).catch(() => ({ data: [] }));

  let handled = 0;
  for (const order of data || []) {
    if (order.status === 'payment_pending') {
      await patchOrder(supabase, order.id, {
        status: 'cancelled',
        cancel_reason: 'first_payment_timeout',
        unique_price: null,
        payment_stage: null,
        payment_expires_at: null,
      });
      await insertSystemMessage(supabase, order.chat_id, `❌ Order #${order.id} — to'lov muddati o'tdi, bekor qilindi.`);
      await sendMessage(order.client_id, `❌ Order #${order.id} bekor qilindi — to'lov muddati o'tdi.`).catch(() => null);
      await sendMessage(order.worker_user_id, `❌ Order #${order.id} bekor qilindi — mijoz to'lovni amalga oshirmadi.`).catch(
        () => null,
      );
    } else {
      // Mijoz natijani qabul qilgan, lekin qolgan to'lovni 3 kunda qilmadi.
      const workerShare = workerShareOnTimeout(order);
      await patchOrder(supabase, order.id, {
        status: 'cancelled',
        cancel_reason: 'final_payment_timeout',
        second_payment_status: 'refunded',
        unique_price: null,
        payment_stage: null,
        payment_expires_at: null,
      });
      await insertSystemMessage(
        supabase,
        order.chat_id,
        `❌ Order #${order.id} — qolgan to'lov muddati (3 kun) o'tdi, bekor qilindi.`,
      );
      await sendMessage(order.client_id, `❌ Order #${order.id} bekor qilindi — to'lov muddati o'tdi.`).catch(() => null);
      await sendMessage(
        order.worker_user_id,
        `❌ Order #${order.id}: mijoz qolgan to'lovni amalga oshirmadi.\n\n💰 Sizga ${formatUzs(workerShare)} to'lanadi.`,
      ).catch(() => null);
      await notifyAdmins(
        `⚠️ <b>Order #${order.id} — qolgan to'lov kelmadi</b>\n\n` +
          `Ushlab qolindi: ${formatUzs(order.first_payment)}\n` +
          `Komissiya: ${formatUzs(order.commission)}\n` +
          `👷 Montajorga to'lanadi: ${formatUzs(workerShare)}`,
      );
    }
    handled += 1;
  }
  return handled;
}

// Deadline ogohlantirish (20% qolganda) va muddati o'tganini belgilash.
async function checkDeadlines(supabase) {
  const now = Date.now();
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=*&status=in.(in_progress,revising)&deadline_at=not.is.null&limit=100`,
  }).catch(() => ({ data: [] }));

  let warned = 0;
  let expired = 0;

  for (const order of data || []) {
    const deadlineMs = new Date(order.deadline_at).getTime();
    const totalMs = Number(order.deadline_hours) * 60 * 60 * 1000;
    const remainingMs = deadlineMs - now;

    if (remainingMs <= 0 && !order.deadline_expired) {
      await patchOrder(supabase, order.id, { deadline_expired: true });
      await insertSystemMessage(supabase, order.chat_id, `⏰ Order #${order.id} — deadline o'tdi.`);
      await sendMessage(
        order.client_id,
        `⏰ <b>Montajor belgilangan muddatga ulgurmadi</b>\n\nOrder #${order.id}\n\nMini App → Orderlar bo'limidan tanlang:\n⏳ Kutaman (1–24 soat qo'shimcha)\n❌ Bekor qilish (50% qaytariladi)`,
      ).catch(() => null);
      await sendMessage(order.worker_user_id, `⏰ Order #${order.id} deadline o'tdi. Mijoz qaror qabul qilmoqda.`).catch(
        () => null,
      );
      expired += 1;
      continue;
    }

    if (remainingMs > 0 && !order.deadline_warning_sent && remainingMs <= totalMs * DEADLINE_WARNING_RATIO) {
      const hoursLeft = Math.max(1, Math.round(remainingMs / (60 * 60 * 1000)));
      await patchOrder(supabase, order.id, { deadline_warning_sent: true });
      await sendMessage(
        order.worker_user_id,
        `⚠️ <b>Deadline yaqinlashmoqda</b>\n\nOrder #${order.id} bo'yicha ~${hoursLeft} soat qoldi!`,
      ).catch(() => null);
      warned += 1;
    }
  }

  return { warned, expired };
}

module.exports = {
  FIRST_PAYMENT_WINDOW_MS,
  FINAL_PAYMENT_WINDOW_MS,
  COMMISSION_RATE,
  calculateOrderMoney,
  workerShareOnTimeout,
  formatUzs,
  formatDateTime,
  adminChatIds,
  notifyAdmins,
  patchOrder,
  insertSystemMessage,
  generateVacancyUniquePrice,
  openPaymentWindow,
  startWork,
  applyDeadlinePenalty,
  matchVacancyPayment,
  expirePaymentWindows,
  checkDeadlines,
};
