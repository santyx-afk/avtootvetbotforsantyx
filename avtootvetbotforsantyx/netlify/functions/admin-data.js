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

    const sanitizePlan = (item = {}) => {
      const allowed = ['manual', 'auto_account', 'license_key', 'instruction_only'];
      if (item.price !== undefined && Number.isNaN(Number(item.price))) throw new Error('price numeric bo‘lishi kerak');
      if (item.old_price !== undefined && item.old_price !== null && item.old_price !== '' && Number.isNaN(Number(item.old_price))) throw new Error('old_price numeric bo‘lishi kerak');
      if (item.delivery_type && !allowed.includes(item.delivery_type)) throw new Error('delivery_type noto‘g‘ri');
      return {
        ...item,
        price: item.price !== undefined ? Number(item.price) : item.price,
        old_price: item.old_price === '' ? null : item.old_price === null || item.old_price === undefined ? item.old_price : Number(item.old_price),
        tags: Array.isArray(item.tags) ? item.tags : [],
      };
    };

    if (event.httpMethod === 'POST') {
      const table = payload.type === 'category' ? 'categories' : 'plans';
      const item = await insertRow(supabase, table, table === 'plans' ? sanitizePlan(payload.item) : payload.item);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item }) };
    }

    if (event.httpMethod === 'PUT') {
      const table = payload.type === 'category' ? 'categories' : 'plans';
      const { id, ...item } = payload.item;
      const updated = await updateRow(supabase, table, id, table === 'plans' ? sanitizePlan(item) : item);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item: updated }) };
    }

    if (event.httpMethod === 'DELETE') {
      const table = payload.type === 'category' ? 'categories' : 'plans';
      await deleteRow(supabase, table, payload.id);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (error) {
    console.error('admin-data error', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Server xatosi' }) };
  }
};
