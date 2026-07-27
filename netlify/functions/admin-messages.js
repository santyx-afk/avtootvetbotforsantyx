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
      // sendMessage(chatId, text) — parse_mode HTML ichida o'rnatiladi
      await sendMessage(telegram_id, text);
      return json(200, { ok: true, message: `Xabar ${telegram_id} ga yuborildi` });
    }

    if (type === 'broadcast') {
      const { data: users } = await request(db, 'users', { query: 'select=telegram_id&is_blocked=eq.false' })
        .catch(() => request(db, 'users', { query: 'select=telegram_id' }));
      const list = users || [];
      // Ketma-ket await sekin edi — funksiya timeout bo'lib, Netlify JSON o'rniga
      // HTML xato sahifasi qaytarardi. Endi parallel batch bilan yuboramiz.
      const BATCH = 25;
      let sent = 0;
      let failed = 0;
      for (let i = 0; i < list.length; i += BATCH) {
        const chunk = list.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          chunk.map((u) => sendMessage(u.telegram_id, text)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') sent += 1;
          else failed += 1;
        }
      }
      return json(200, { ok: true, message: `Yuborildi: ${sent}, xato: ${failed}` });
    }

    return json(400, { ok: false, error: 'Noma\'lum tur' });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};
