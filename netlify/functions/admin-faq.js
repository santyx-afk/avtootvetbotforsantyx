const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, toQuery, insertRow, updateRow, deleteRow } = require('../../shared/db');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

async function listFaq(db) {
  const { data } = await request(db, 'faq', { query: 'select=*&order=sort_order.asc.nullslast,created_at.asc' });
  return data || [];
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      return json(200, { ok: true, items: await listFaq(db) });
    }
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      if (payload.action === 'reorder') {
        const items = await listFaq(db);
        const idx = items.findIndex((f) => f.id === payload.id);
        if (idx === -1) return json(404, { ok: false });
        const swapIdx = payload.dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= items.length) return json(200, { ok: true });
        const a = items[idx], b = items[swapIdx];
        await Promise.all([
          updateRow(db, 'faq', a.id, { sort_order: b.sort_order }),
          updateRow(db, 'faq', b.id, { sort_order: a.sort_order }),
        ]);
        return json(200, { ok: true });
      }
      const item = await insertRow(db, 'faq', payload);
      return json(200, { ok: true, item });
    }
    if (event.httpMethod === 'PUT') {
      const { id, ...patch } = JSON.parse(event.body || '{}');
      const item = await updateRow(db, 'faq', id, patch);
      return json(200, { ok: true, item });
    }
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      await deleteRow(db, 'faq', id);
      return json(200, { ok: true });
    }
    return json(405, { ok: false });
  } catch (err) {
    console.error('admin-faq error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
