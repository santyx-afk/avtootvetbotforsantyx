// Broadcast: ko'p foydalanuvchiga xabar yuborish navbati.
//
// Ikki tur:
//   copy — "Admin xabari": admin panelda tugmani bosadi, bot unga "xabar
//          kutilyapti" deb yozadi, admin botga istalgan xabar (matn, rasm,
//          video, fayl, emoji, formatlash) yuboradi, bot preview + tasdiq
//          so'raydi, tasdiqlangach xabar copyMessage bilan hammaga nusxalanadi.
//   text — panel formasidagi oddiy matn.
//
// Yuborish Netlify funksiyasining 10 soniyasiga sig'maydi (1 200+ kishi),
// shuning uchun ish bazada (broadcast_jobs) saqlanadi va:
//   1) background funksiya (broadcast-background, 15 daqiqagacha) yuboradi;
//   2) u ishlamasa/uzilsa maintenance cron har 5 daqiqada cursor'dan davom
//      ettiradi (resumeStalledBroadcasts).
// Har batch'dan keyin cursor/sent/failed bazaga yoziladi — hech kim ikki
// marta olmaydi, hech kim tushib qolmaydi.

const { request, toQuery, fetchUserState, saveUserState, isAdminTelegramId, fetchSettings } = require('./db');
const { sendMessage, editMessage, copyMessage, inlineKeyboard } = require('./telegram');
const { adminChatIds } = require('./admin-notify');
const { escapeHtml } = require('./messages');

const SEGMENTS = {
  all: 'Hamma (bloklanmaganlar)',
  with_phone: 'Raqam berganlar',
  buyers: 'Xarid qilganlar',
  no_purchase: 'Xarid qilmaganlar',
  with_balance: 'Balansi borlar',
  inactive_30d: '30 kun faol bo‘lmaganlar',
  lang_uz: 'Til: o‘zbek',
  lang_ru: 'Til: rus',
  lang_en: 'Til: ingliz',
};
const BATCH = 20; // Telegram: sekundiga ~30 xabar chegarasi, zaxira bilan
const BATCH_PAUSE_MS = 1100;
const STALL_MINUTES = 3;
const STATE_KEY = 'awaiting_broadcast_job';

function segmentLabel(segment) {
  return SEGMENTS[segment] || SEGMENTS.all;
}

function normalizeSegment(segment) {
  return SEGMENTS[segment] ? segment : 'all';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Segment filtri (sof funksiya — testlanadi). ctx: { buyers:Set, recent:Set,
// withBalance:Set, now:number }.
function filterSegment(users, segment, ctx = {}) {
  const seg = normalizeSegment(segment);
  const buyers = ctx.buyers || new Set();
  const recent = ctx.recent || new Set();
  const withBalance = ctx.withBalance || new Set();
  const cutoff = (ctx.now || Date.now()) - 30 * 24 * 60 * 60 * 1000;
  return users.filter((u) => {
    const id = String(u.telegram_id);
    if (seg === 'with_phone') return Boolean(u.phone);
    if (seg === 'buyers') return buyers.has(id);
    if (seg === 'no_purchase') return !buyers.has(id);
    if (seg === 'with_balance') return withBalance.has(id);
    if (seg === 'inactive_30d') return !recent.has(id) && new Date(u.updated_at || u.created_at || 0).getTime() < cutoff;
    if (seg.startsWith('lang_')) return String(u.webapp_lang || u.language_code || 'uz').toLowerCase().startsWith(seg.slice(5));
    return true;
  }).map((u) => String(u.telegram_id));
}

// Segment bo'yicha qabul qiluvchilar ro'yxati (telegram_id massiv).
async function resolveSegment(supabase, segment) {
  const seg = normalizeSegment(segment);
  const { data: users } = await request(supabase, 'users', {
    query: 'select=telegram_id,phone,language_code,webapp_lang,created_at,updated_at&is_blocked=eq.false&order=created_at.asc&limit=10000',
  });
  const list = users || [];
  const ctx = { now: Date.now() };
  if (['buyers', 'no_purchase', 'inactive_30d'].includes(seg)) {
    const { data: orders } = await request(supabase, 'orders', {
      query: toQuery({
        select: 'user_telegram_id,created_at,order_type',
        status: 'in.(completed,approved,payment_detected,delivering)',
        limit: 20000,
      }),
    }).catch(() => ({ data: [] }));
    const cutoff = ctx.now - 30 * 24 * 60 * 60 * 1000;
    ctx.buyers = new Set();
    ctx.recent = new Set();
    for (const o of orders || []) {
      const id = String(o.user_telegram_id);
      if (String(o.order_type || 'purchase') !== 'topup') ctx.buyers.add(id);
      if (new Date(o.created_at).getTime() >= cutoff) ctx.recent.add(id);
    }
  }
  if (seg === 'with_balance') {
    const { data: wallets } = await request(supabase, 'user_wallets', { query: 'select=user_telegram_id&balance=gt.0&limit=20000' }).catch(() => ({ data: [] }));
    ctx.withBalance = new Set((wallets || []).map((w) => String(w.user_telegram_id)));
  }
  return filterSegment(list, seg, ctx);
}

async function getJob(supabase, jobId) {
  const { data } = await request(supabase, 'broadcast_jobs', { query: toQuery({ select: '*', id: `eq.${jobId}`, limit: 1 }) });
  return data?.[0] || null;
}

async function patchJob(supabase, jobId, patch) {
  const { data } = await request(supabase, 'broadcast_jobs', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${jobId}` }),
    headers: { Prefer: 'return=representation' },
    body: { ...patch, updated_at: new Date().toISOString() },
  });
  return data?.[0] || null;
}

async function createJob(supabase, { kind, segment, adminTelegramId, text = null, status }) {
  const seg = normalizeSegment(segment);
  const recipients = await resolveSegment(supabase, seg);
  const { data } = await request(supabase, 'broadcast_jobs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      kind,
      status: status || (kind === 'copy' ? 'awaiting_message' : 'queued'),
      segment: seg,
      admin_telegram_id: adminTelegramId ? String(adminTelegramId) : null,
      text,
      recipients,
      total: recipients.length,
    },
  });
  return data?.[0] || null;
}

async function listJobs(supabase, limit = 30) {
  const { data } = await request(supabase, 'broadcast_jobs', {
    query: toQuery({ select: 'id,kind,status,segment,admin_telegram_id,text,total,cursor,sent,failed,error,created_at,started_at,finished_at', order: 'created_at.desc', limit }),
  });
  return data || [];
}

// Adminlardan qaysi biriga "xabar kutilyapti" yoziladi: Sozlamalardagi
// admin_telegram_id, bo'lmasa env'dagi birinchi admin.
async function primaryAdminId(supabase) {
  const settings = await fetchSettings(supabase).catch(() => null);
  return adminChatIds(settings)[0] || null;
}

async function isAdmin(supabase, telegramId) {
  if (isAdminTelegramId(telegramId)) return true;
  const settings = await fetchSettings(supabase).catch(() => null);
  return adminChatIds(settings).includes(String(telegramId));
}

function cancelKeyboard(jobId) {
  return inlineKeyboard([[{ text: '❌ Bekor qilish', callback_data: `bc:cancel:${jobId}` }]]);
}

// 1-qadam (panel): ish yaratiladi, adminga bot orqali "xabar kutilyapti".
async function startAdminBroadcast(supabase, { segment }) {
  const adminId = await primaryAdminId(supabase);
  if (!adminId) throw new Error('Admin Telegram ID sozlanmagan (Sozlamalar → Admin Telegram ID)');
  const job = await createJob(supabase, { kind: 'copy', segment, adminTelegramId: adminId });
  if (!job) throw new Error('Broadcast ishini yaratib bo‘lmadi');

  const text = [
    '📣 <b>Admin xabari — xabar kutilyapti</b>',
    '',
    'Yubormoqchi bo‘lgan xabaringizni shu chatga jo‘nating: matn, rasm, video, fayl — emoji va formatlash saqlanadi.',
    '',
    `👥 Qabul qiluvchilar: ${escapeHtml(segmentLabel(job.segment))} — <b>${job.total}</b> kishi`,
    '',
    'Yuborishdan oldin men xabarni ko‘rsatib, tasdiq so‘rayman.',
  ].join('\n');
  const sent = await sendMessage(adminId, text, cancelKeyboard(job.id));
  await patchJob(supabase, job.id, { prompt_chat_id: String(adminId), prompt_message_id: sent?.message_id || null });

  // Adminning keyingi xabari shu ishga biriktiriladi.
  const state = await fetchUserState(supabase, adminId).catch(() => ({}));
  await saveUserState(supabase, adminId, { ...state, [STATE_KEY]: job.id });
  return { ...job, admin_telegram_id: adminId };
}

// 2-qadam (webhook): admin botga xabar yubordi — preview + tasdiq.
// true qaytsa xabar "yeyildi" (chek/buyruq deb qaralmaydi).
async function handleAdminBroadcastMessage({ supabase, message }) {
  const fromId = String(message?.from?.id || '');
  if (!fromId) return false;
  const state = await fetchUserState(supabase, fromId).catch(() => ({}));
  const jobId = state?.[STATE_KEY];
  if (!jobId) return false;
  if (typeof message.text === 'string' && message.text.startsWith('/')) return false; // buyruqlar o'z yo'lida

  const job = await getJob(supabase, jobId).catch(() => null);
  const clearState = () => saveUserState(supabase, fromId, { ...state, [STATE_KEY]: null }).catch(() => {});
  if (!job || job.status !== 'awaiting_message') {
    await clearState();
    return false;
  }
  if (!(await isAdmin(supabase, fromId))) {
    await clearState();
    return false;
  }

  await patchJob(supabase, jobId, { from_chat_id: String(message.chat.id), message_id: message.message_id, status: 'awaiting_confirm' });
  await clearState();

  // Eski "kutilyapti" xabaridan tugmani olib tashlaymiz.
  if (job.prompt_chat_id && job.prompt_message_id) {
    await editMessage(job.prompt_chat_id, job.prompt_message_id, '📣 Admin xabari — xabar qabul qilindi, pastda tasdiqlang 👇', null).catch(() => {});
  }
  // Preview: xabar aynan qanday ketishini ko'rsatamiz.
  await copyMessage(fromId, message.chat.id, message.message_id).catch(() => {});
  const confirm = await sendMessage(
    fromId,
    [
      '👆 Shu xabar yuboriladi.',
      '',
      `👥 ${escapeHtml(segmentLabel(job.segment))} — <b>${job.total}</b> kishi`,
      '',
      'Tasdiqlaysizmi?',
    ].join('\n'),
    inlineKeyboard([
      [{ text: `✅ Hammaga yuborish (${job.total})`, callback_data: `bc:send:${jobId}` }],
      [{ text: '❌ Bekor qilish', callback_data: `bc:cancel:${jobId}` }],
    ]),
  );
  await patchJob(supabase, jobId, { prompt_chat_id: fromId, prompt_message_id: confirm?.message_id || null });
  return true;
}

// Background funksiyani chaqirish (202 darhol qaytadi). Muvaffaqiyatsiz
// bo'lsa false — chaqiruvchi o'zi boshlab beradi, cron davom ettiradi.
async function triggerBackground(jobId) {
  const base = (process.env.APP_BASE_URL || 'https://santyx.uz').replace(/\/+$/, '');
  const secret = broadcastSecret();
  if (!secret) return false;
  try {
    const res = await fetch(`${base}/.netlify/functions/broadcast-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-broadcast-secret': secret },
      body: JSON.stringify({ job_id: jobId }),
      signal: AbortSignal.timeout(5000),
    });
    return res.status === 202 || res.ok;
  } catch (error) {
    console.warn('broadcast background trigger warn:', error?.message);
    return false;
  }
}

function broadcastSecret() {
  return process.env.BROADCAST_SECRET || process.env.SESSION_SECRET || '';
}

async function notifyAdminProgress(supabase, job, text, keyboard = null) {
  if (job.prompt_chat_id && job.prompt_message_id) {
    const ok = await editMessage(job.prompt_chat_id, job.prompt_message_id, text, keyboard).then(() => true).catch(() => false);
    if (ok) return;
  }
  const to = job.admin_telegram_id || job.prompt_chat_id;
  if (to) await sendMessage(to, text, keyboard).catch(() => {});
}

// Tasdiqlangan ishni navbatga qo'yish va yuborishni boshlash.
async function queueJob(supabase, jobId) {
  const job = await patchJob(supabase, jobId, { status: 'queued', started_at: new Date().toISOString(), error: null });
  if (!job) return null;
  await notifyAdminProgress(supabase, job, `⏳ Yuborilmoqda… 0/${job.total}`);
  const triggered = await triggerBackground(jobId);
  if (!triggered) {
    // Background yo'q — hozir qisqa budjet bilan boshlab beramiz, qolganini cron.
    await processJob(supabase, job, { budgetMs: 5000 });
  }
  return job;
}

async function cancelJob(supabase, jobId) {
  const job = await getJob(supabase, jobId);
  if (!job) return null;
  if (['done', 'cancelled'].includes(job.status)) return job;
  const updated = await patchJob(supabase, jobId, { status: 'cancelled', finished_at: new Date().toISOString() });
  if (job.admin_telegram_id) {
    const state = await fetchUserState(supabase, job.admin_telegram_id).catch(() => ({}));
    if (state?.[STATE_KEY] === jobId) await saveUserState(supabase, job.admin_telegram_id, { ...state, [STATE_KEY]: null }).catch(() => {});
  }
  await notifyAdminProgress(supabase, updated || job, `❌ Broadcast bekor qilindi${job.sent ? ` (${job.sent} kishiga ketib ulgurgan)` : ''}.`);
  return updated;
}

// Bot callback'lari: bc:send:<id>, bc:cancel:<id>. true — qayta ishlandi.
async function handleBroadcastCallback({ supabase, callbackQuery }) {
  const data = String(callbackQuery.data || '');
  if (!data.startsWith('bc:')) return false;
  const { answerCallbackQuery } = require('./telegram');
  const [, action, jobId] = data.split(':');
  if (!(await isAdmin(supabase, callbackQuery.from.id))) {
    await answerCallbackQuery(callbackQuery.id, 'Huquq yetarli emas').catch(() => {});
    return true;
  }
  if (action === 'cancel') {
    await cancelJob(supabase, jobId);
    await answerCallbackQuery(callbackQuery.id, 'Bekor qilindi').catch(() => {});
    return true;
  }
  if (action === 'send') {
    const job = await getJob(supabase, jobId);
    if (!job || job.status !== 'awaiting_confirm') {
      await answerCallbackQuery(callbackQuery.id, job ? `Holat: ${job.status}` : 'Ish topilmadi').catch(() => {});
      return true;
    }
    await answerCallbackQuery(callbackQuery.id, 'Yuborish boshlandi').catch(() => {});
    await queueJob(supabase, jobId);
    return true;
  }
  return true;
}

// Yuborish sikli: budjet tugaguncha yoki ro'yxat tugaguncha. Har batch'dan
// keyin cursor bazaga yoziladi; bekor qilinganini har batch'da tekshiradi.
async function processJob(supabase, jobInput, { budgetMs = 13 * 60 * 1000 } = {}) {
  let job = await getJob(supabase, jobInput.id || jobInput);
  if (!job) return null;
  if (!['queued', 'sending'].includes(job.status)) return job;
  if (job.kind === 'copy' && (!job.from_chat_id || !job.message_id)) {
    return patchJob(supabase, job.id, { status: 'failed', error: 'Nusxa olinadigan xabar yo‘q', finished_at: new Date().toISOString() });
  }
  const recipients = Array.isArray(job.recipients) ? job.recipients : [];
  let { cursor = 0, sent = 0, failed = 0 } = job;
  job = (await patchJob(supabase, job.id, { status: 'sending' })) || job;
  const deadline = Date.now() + budgetMs;
  let lastProgressAt = Date.now();

  while (cursor < recipients.length) {
    if (Date.now() > deadline) break;
    const chunk = recipients.slice(cursor, cursor + BATCH);
    const results = await Promise.allSettled(
      chunk.map((id) => (job.kind === 'copy'
        ? copyMessage(String(id), job.from_chat_id, job.message_id)
        : sendMessage(String(id), job.text || ''))),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') sent += 1;
      else failed += 1;
    }
    cursor += chunk.length;
    const fresh = await patchJob(supabase, job.id, { cursor, sent, failed });
    // Bekor qilingan bo'lsa (patch status'ga tegmaydi) — to'xtaymiz.
    if (!fresh || fresh.status === 'cancelled') return fresh || job;
    if (Date.now() - lastProgressAt > 15000) {
      await notifyAdminProgress(supabase, fresh, `⏳ Yuborilmoqda… ${cursor}/${recipients.length}`);
      lastProgressAt = Date.now();
    }
    if (cursor < recipients.length) await sleep(BATCH_PAUSE_MS);
  }

  if (cursor >= recipients.length) {
    const done = await patchJob(supabase, job.id, { status: 'done', cursor, sent, failed, finished_at: new Date().toISOString() });
    await notifyAdminProgress(supabase, done || job, `✅ Broadcast yakunlandi.\n\nYuborildi: <b>${sent}</b>\nXato (bot bloklangan va h.k.): <b>${failed}</b>\nJami: ${recipients.length}`);
    return done;
  }
  return job; // budjet tugadi — 'sending' holatida, cron davom ettiradi
}

// Uzilib qolgan ishlarni davom ettirish (maintenance cron). Faqat 3 daqiqadan
// beri yangilanmaganlar — hozir background ishlayotganini bezovta qilmaymiz.
async function resumeStalledBroadcasts(supabase, { budgetMs = 5000 } = {}) {
  const cutoff = new Date(Date.now() - STALL_MINUTES * 60 * 1000).toISOString();
  const { data } = await request(supabase, 'broadcast_jobs', {
    query: toQuery({ select: 'id,status,updated_at', status: 'in.(queued,sending)', updated_at: `lt.${cutoff}`, order: 'created_at.asc', limit: 3 }),
  }).catch(() => ({ data: [] }));
  const jobs = data || [];
  const deadline = Date.now() + budgetMs;
  const results = [];
  for (const j of jobs) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    // Avval background'ni qayta uyg'otamiz; bo'lmasa o'zimiz qisqa budjet bilan.
    const triggered = await triggerBackground(j.id);
    if (triggered) { results.push({ id: j.id, status: 'retriggered' }); continue; }
    const r = await processJob(supabase, j, { budgetMs: left });
    results.push({ id: j.id, status: r?.status });
  }
  return results;
}

module.exports = {
  SEGMENTS,
  segmentLabel,
  normalizeSegment,
  filterSegment,
  resolveSegment,
  createJob,
  getJob,
  listJobs,
  startAdminBroadcast,
  handleAdminBroadcastMessage,
  handleBroadcastCallback,
  queueJob,
  cancelJob,
  processJob,
  resumeStalledBroadcasts,
  broadcastSecret,
  primaryAdminId,
  STATE_KEY,
};
