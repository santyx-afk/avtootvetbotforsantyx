const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, listTable, insertRow, updateRow, deleteRow } = require('../../shared/db');

function unauthorized() {
  return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Unauthorized' }) };
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return unauthorized();
  const supabase = getAdminClient();

  try {
    if (event.httpMethod === 'GET') {
      const [categories, plans] = await Promise.all([listTable(supabase, 'categories'), listTable(supabase, 'plans')]);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, categories, plans }) };
    }

    const payload = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'POST') {
      const table = payload.type === 'category' ? 'categories' : 'plans';
      const item = await insertRow(supabase, table, payload.item);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item }) };
    }

    if (event.httpMethod === 'PUT') {
      const table = payload.type === 'category' ? 'categories' : 'plans';
      const { id, ...item } = payload.item;
      const updated = await updateRow(supabase, table, id, item);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item: updated }) };
    }

    if (event.httpMethod === 'DELETE') {
      const table = payload.type === 'category' ? 'categories' : 'plans';
      await deleteRow(supabase, table, payload.id);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (error) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: error.message }) };
  }
};
