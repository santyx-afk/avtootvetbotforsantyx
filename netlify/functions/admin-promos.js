const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, insertRow, updateRow, deleteRow } = require('../../shared/db');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

// Admin formadan kelgan xom promokod ma'lumotlarini DB ustunlariga moslaydi.
// Kod har doim katta harf (getPromoCode lookup ham katta harfda qidiradi).
function normalize(payload = {}) {
  const out = {};
  if (payload.code !== undefined) out.code = String(payload.code || '').trim().toUpperCase();
  if (payload.discount_type !== undefined) {
    out.discount_type = payload.discount_type === 'percent' ? 'percent' : 'fixed';
  }
  if (payload.discount_value !== undefined) out.discount_value = Number(payload.discount_value || 0);
  if (payload.min_order_amount !== undefined) out.min_order_amount = Number(payload.min_order_amount || 0);
  if (payload.max_uses !== undefined) {
    out.max_uses = payload.max_uses === '' || payload.max_uses == null ? null : Number(payload.max_uses);
  }
  if (payload.expires_at !== undefined) {
    out.expires_at = payload.expires_at ? new Date(payload.expires_at).toISOString() : null;
  }
  if (payload.is_one_time !== undefined) out.is_one_time = Boolean(payload.is_one_time);
  if (payload.is_active !== undefined) out.is_active = Boolean(payload.is_active);
  return out;
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const { data } = await request(db, 'promo_codes', { query: 'select=*&order=created_at.desc' });
      return json(200, { ok: true, promos: data || [] });
    }
    if (event.httpMethod === 'POST') {
      const payload = normalize(JSON.parse(event.body || '{}'));
      if (!payload.code) return json(400, { ok: false, error: 'Kod talab qilinadi' });
      const item = await insertRow(db, 'promo_codes', payload);
      return json(200, { ok: true, item });
    }
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { id } = body;
      if (!id) return json(400, { ok: false, error: 'id talab qilinadi' });
      const patch = normalize(body);
      const item = await updateRow(db, 'promo_codes', id, patch);
      return json(200, { ok: true, item });
    }
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      await deleteRow(db, 'promo_codes', id);
      return json(200, { ok: true });
    }
    return json(405, { ok: false });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};
