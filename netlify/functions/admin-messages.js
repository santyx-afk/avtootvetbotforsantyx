const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request } = require('../../shared/db');
const { sendMessage } = require('../../shared/telegram');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  if (event.httpMethod !== 'POST') return json(405, { ok: false });

  const db = getAdminClient();
  const { type, text, telegram_id } = JSON.parse(event.body || '{}');
  if (!text) return json(400, { ok: false, error: 'Xabar matni bo\'sh' });

  try {
    if (type === 'individual') {
      if (!telegram_id) return json(400, { ok: false, error: 'Telegram ID kiriting' });
      await sendMessage(telegram_id, text, { parse_mode: 'HTML' });
      return json(200, { ok: true, message: `Xabar ${telegram_id} ga yuborildi` });
    }

    if (type === 'broadcast') {
      const { data: users } = await request(db, 'users', { query: 'select=telegram_id&is_blocked=eq.false' });
      let sent = 0, failed = 0;
      for (const u of (users || [])) {
        try {
          await sendMessage(u.telegram_id, text, { parse_mode: 'HTML' });
          sent++;
        } catch {
          failed++;
        }
      }
      return json(200, { ok: true, message: `Yuborildi: ${sent}, xato: ${failed}` });
    }

    return json(400, { ok: false, error: 'Noma\'lum tur' });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};
