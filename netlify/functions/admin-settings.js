const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, fetchSettings, insertRow, updateRow } = require('../../shared/db');

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false }) };
  }
  const supabase = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const settings = await fetchSettings(supabase);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, settings }) };
    }
    if (event.httpMethod === 'PUT') {
      const payload = JSON.parse(event.body || '{}');
      const existing = await fetchSettings(supabase);
      const settings = existing ? await updateRow(supabase, 'settings', 1, payload) : await insertRow(supabase, 'settings', { id: 1, ...payload });
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, settings }) };
    }
    return { statusCode: 405, body: 'Method not allowed' };
  } catch (error) {
    console.error('admin-settings error', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'server_error' }) };
  }
};
