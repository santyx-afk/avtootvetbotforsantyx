const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, toQuery, updateRow } = require('../../shared/db');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const { data } = await request(db, 'users', { query: 'select=telegram_id,username,full_name,phone,language_code,is_blocked,created_at&order=created_at.desc&limit=500' })
        .catch(() => request(db, 'users', { query: 'select=telegram_id,username,full_name,phone,language_code,created_at&order=created_at.desc&limit=500' }));
      return json(200, { ok: true, users: data || [] });
    }
    if (event.httpMethod === 'POST') {
      const { action, telegram_id } = JSON.parse(event.body || '{}');
      if (!telegram_id) return json(400, { ok: false, error: 'telegram_id talab qilinadi' });
      if (action === 'block') {
        await request(db, 'users', {
          method: 'PATCH',
          query: toQuery({ telegram_id: `eq.${telegram_id}` }),
          headers: { Prefer: 'return=representation' },
          body: { is_blocked: true },
        });
        return json(200, { ok: true });
      }
      if (action === 'unblock') {
        await request(db, 'users', {
          method: 'PATCH',
          query: toQuery({ telegram_id: `eq.${telegram_id}` }),
          headers: { Prefer: 'return=representation' },
          body: { is_blocked: false },
        });
        return json(200, { ok: true });
      }
      return json(400, { ok: false, error: 'Unknown action' });
    }
    return json(405, { ok: false });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};
