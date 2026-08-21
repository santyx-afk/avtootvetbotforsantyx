const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, updateRow, deleteRow } = require('../../shared/db');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const { data } = await request(db, 'reviews', { query: 'select=*&order=created_at.desc&limit=200' });
      return json(200, { ok: true, reviews: data || [] });
    }
    if (event.httpMethod === 'POST') {
      const { action, id } = JSON.parse(event.body || '{}');
      if (action === 'approve') {
        await updateRow(db, 'reviews', id, { status: 'approved' });
        return json(200, { ok: true });
      }
      if (action === 'reject') {
        await updateRow(db, 'reviews', id, { status: 'rejected' });
        return json(200, { ok: true });
      }
      if (action === 'delete') {
        await deleteRow(db, 'reviews', id);
        return json(200, { ok: true });
      }
      return json(400, { ok: false, error: 'Unknown action' });
    }
    return json(405, { ok: false });
  } catch (err) {
    console.error('admin-reviews error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
