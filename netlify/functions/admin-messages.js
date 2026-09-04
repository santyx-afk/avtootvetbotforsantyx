const { requireAdmin } = require('../../shared/auth');
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
} = require('../../shared/broadcast-service');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

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

    if (type === 'admin') {
      const job = await startAdminBroadcast(db, { segment: normalizeSegment(body.segment) });
      return json(200, {
        ok: true,
        job,
        message: `Telegram'da botga xabaringizni yuboring — ${job.total} kishiga ketadi. Bot avval ko'rsatib, tasdiq so'raydi.`,
      });
    }

    if (type === 'broadcast') {
      if (!text) return json(400, { ok: false, error: 'Xabar matni bo\'sh' });
      const job = await createJob(db, {
        kind: 'text',
        segment: normalizeSegment(body.segment),
        adminTelegramId: await primaryAdminId(db),
        text: String(text).slice(0, 4000),
        status: 'queued',
      });
      if (!job) return json(500, { ok: false, error: 'Navbatga qo\'yib bo\'lmadi' });
      await queueJob(db, job.id);
      return json(200, { ok: true, job, message: `Navbatga qo'yildi: ${job.total} kishi. Jarayon pastdagi tarixda ko'rinadi.` });
    }

    return json(400, { ok: false, error: 'Noma\'lum tur' });
  } catch (err) {
    console.error('admin-messages error', err);
    return json(500, { ok: false, error: err?.expose ? err.message : (err?.message || 'server_error') });
  }
};
