// Netlify BACKGROUND funksiya (nomi "-background" bilan tugaydi): chaqiruvchiga
// darhol 202 qaytadi, o'zi 15 daqiqagacha ishlaydi. Broadcast ishini
// (broadcast_jobs) oxirigacha yuboradi; uzilsa maintenance cron davom ettiradi.
//
// Himoya: faqat x-broadcast-secret (BROADCAST_SECRET yoki SESSION_SECRET) bilan
// chaqirilsa ishlaydi — manzil ochiq, lekin begona chaqira olmaydi.
const { getAdminClient } = require('../../shared/db');
const { processJob, broadcastSecret } = require('../../shared/broadcast-service');

exports.handler = async (event) => {
  const secret = broadcastSecret();
  const given = event.headers?.['x-broadcast-secret'] || event.headers?.['X-Broadcast-Secret'] || '';
  if (!secret || given !== secret) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  }
  let jobId = '';
  try {
    jobId = String(JSON.parse(event.body || '{}').job_id || '');
  } catch {
    /* bo'sh */
  }
  if (!jobId) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'job_id kerak' }) };

  const supabase = getAdminClient();
  try {
    const result = await processJob(supabase, jobId, { budgetMs: 13 * 60 * 1000 });
    console.log('broadcast job', jobId, result?.status, result?.sent, result?.failed);
  } catch (error) {
    console.error('broadcast background error', error);
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
