const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, insertRow, updateRow, deleteRow } = require('../../shared/db');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const { data } = await request(db, 'banners', { query: 'select=*&order=sort_order.asc.nullslast,created_at.asc' });
      return json(200, { ok: true, banners: data || [] });
    }
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const item = await insertRow(db, 'banners', payload);
      return json(200, { ok: true, item });
    }
    if (event.httpMethod === 'PUT') {
      const { id, ...patch } = JSON.parse(event.body || '{}');
      const item = await updateRow(db, 'banners', id, patch);
      return json(200, { ok: true, item });
    }
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      await deleteRow(db, 'banners', id);
      return json(200, { ok: true });
    }
    return json(405, { ok: false });
  } catch (err) {
    console.error('admin-banners error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
