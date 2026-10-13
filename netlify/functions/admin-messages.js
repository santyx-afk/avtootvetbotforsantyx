const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient } = require('../../shared/db');
const { sendMessage } = require('../../shared/telegram');
const {
  SEGMENTS,
  normalizeSegment,
  startAdminBroadcast,
  createJob,
  queueJob,
  listJobs,
  cancelJob,
  primaryAdminId,
  formatTashkent,
} = require('../../shared/broadcast-service');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

const MAX_SCHEDULE_DAYS = 60;
const SCHEDULE_MIGRATION_HINT = 'Rejalashtirish uchun migrations/2026-10-12_broadcast-scheduled.sql qo‘llanishi kerak.';

// Rejalashtirilgan vaqt: bo'sh — darhol. Kamida 1 daqiqa keyin, 60 kundan uzoq emas.
// Qaytaradi: { iso } yoki { error }.
function parseSchedule(raw) {
  if (!raw) return { iso: null };
  const t = Date.parse(String(raw));
  if (!Number.isFinite(t)) return { error: 'Yuborish vaqti noto‘g‘ri' };
  if (t < Date.now() + 60 * 1000) return { error: 'Yuborish vaqti kamida 1 daqiqa keyin bo‘lishi kerak' };
  if (t > Date.now() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) return { error: `${MAX_SCHEDULE_DAYS} kundan uzoqqa rejalashtirib bo‘lmaydi` };
  return { iso: new Date(t).toISOString() };
}

// Migratsiya qo'llanmagan bo'lsa (scheduled_at ustuni / 'scheduled' holati yo'q)
const isScheduleSchemaError = (error) => /scheduled_at|broadcast_jobs_status_check/.test(String(error?.message || ''));

// Xabar yuborish:
//   individual — bitta foydalanuvchiga hozir.
//   broadcast  — matnli xabar segmentga, navbat orqali (background funksiya,
//                uzilsa cron davom ettiradi) — 10 soniyalik chegara muammosi yo'q.
//   admin      — "Admin xabari": bot adminga "xabar kutilyapti" deb yozadi,
//                admin botga rasm/video/fayl/matn yuboradi, tasdiqlagach
//                hammaga nusxalanadi (shared/broadcast-service.js).
//   cancel     — ishni to'xtatish.
// GET — yuborilganlar tarixi (broadcast_jobs) va segmentlar ro'yxati.
exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();

  try {
    if (event.httpMethod === 'GET') {
      return json(200, { ok: true, jobs: await listJobs(db), segments: SEGMENTS });
    }
    if (event.httpMethod !== 'POST') return json(405, { ok: false });

    const body = JSON.parse(event.body || '{}');
    const { type, text, telegram_id } = body;
    // Ommaviy xabarlar — faqat egasi; bitta mijozga yozish operatorga ham mumkin
    if (type !== 'individual' && !requireOwner(event.headers)) return json(403, { ok: false, error: 'Faqat egasi uchun' });

    if (type === 'cancel') {
      const jobId = String(body.job_id || '');
      if (!jobId) return json(400, { ok: false, error: 'job_id kerak' });
      const job = await cancelJob(db, jobId);
      return json(200, { ok: true, job });
    }

    if (type === 'individual') {
      if (!text) return json(400, { ok: false, error: 'Xabar matni bo\'sh' });
      if (!telegram_id) return json(400, { ok: false, error: 'Telegram ID kiriting' });
      // sendMessage(chatId, text) — parse_mode HTML ichida o'rnatilgan
      await sendMessage(telegram_id, text);
      return json(200, { ok: true, message: `Xabar ${telegram_id} ga yuborildi` });
    }

    const schedule = parseSchedule(body.scheduled_at);
    if (schedule.error) return json(400, { ok: false, error: schedule.error });
    const when = schedule.iso ? `${formatTashkent(schedule.iso)} (Toshkent)` : null;

    if (type === 'admin') {
      let job;
      try {
        job = await startAdminBroadcast(db, { segment: normalizeSegment(body.segment), scheduledAt: schedule.iso });
      } catch (error) {
        if (schedule.iso && isScheduleSchemaError(error)) return json(500, { ok: false, error: SCHEDULE_MIGRATION_HINT });
        throw error;
      }
      return json(200, {
        ok: true,
        job,
        message: `Telegram'da botga xabaringizni yuboring — ${job.total} kishiga ketadi. Bot avval ko'rsatib, tasdiq so'raydi.`
          + (when ? ` Tasdiqlagach ${when} da yuboriladi.` : ''),
      });
    }

    if (type === 'broadcast') {
      if (!text) return json(400, { ok: false, error: 'Xabar matni bo\'sh' });
      let job;
      try {
        job = await createJob(db, {
          kind: 'text',
          segment: normalizeSegment(body.segment),
          adminTelegramId: await primaryAdminId(db),
          text: String(text).slice(0, 4000),
          status: schedule.iso ? 'scheduled' : 'queued',
          scheduledAt: schedule.iso,
        });
      } catch (error) {
        if (schedule.iso && isScheduleSchemaError(error)) return json(500, { ok: false, error: SCHEDULE_MIGRATION_HINT });
        throw error;
      }
      if (!job) return json(500, { ok: false, error: 'Navbatga qo\'yib bo\'lmadi' });
      if (schedule.iso) {
        return json(200, { ok: true, job, message: `⏰ Rejalashtirildi: ${when} da yuboriladi (hozir ${job.total} kishi; ro'yxat yuborish paytida yangilanadi).` });
      }
      await queueJob(db, job.id, { fromStatus: 'queued' });
      return json(200, { ok: true, job, message: `Navbatga qo'yildi: ${job.total} kishi. Jarayon pastdagi tarixda ko'rinadi.` });
    }

    return json(400, { ok: false, error: 'Noma\'lum tur' });
  } catch (err) {
    console.error('admin-messages error', err);
    return json(500, { ok: false, error: err?.expose ? err.message : (err?.message || 'server_error') });
  }
};
