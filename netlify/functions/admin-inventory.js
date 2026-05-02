const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, createInventoryItem, listInventoryByPlan, getInventoryCountsByPlan, updateRow } = require('../../shared/db');
const { encryptText } = require('../../shared/encryption');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const supabase = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const planId = event.queryStringParameters?.plan_id;
      if (!planId) return json(400, { ok: false, error: 'plan_id talab qilinadi' });
      const [items, counts] = await Promise.all([listInventoryByPlan(supabase, planId), getInventoryCountsByPlan(supabase, planId)]);
      return json(200, { ok: true, items, counts });
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      if (payload.action === 'disable') {
        const item = await updateRow(supabase, 'inventory_items', payload.id, { status: 'disabled' });
        return json(200, { ok: true, item });
      }
      const type = payload.type === 'account' ? 'auto_account' : payload.type;
      if (!['auto_account', 'license_key'].includes(type)) return json(400, { ok: false, error: 'type noto‘g‘ri' });
      if (!payload.plan_id) return json(400, { ok: false, error: 'plan_id talab qilinadi' });
      if (type === 'auto_account' && (!payload.login || !payload.password)) return json(400, { ok: false, error: 'account uchun login va parol talab qilinadi' });
      if (type === 'license_key' && !payload.license_key) return json(400, { ok: false, error: 'license_key talab qilinadi' });
      const row = await createInventoryItem(supabase, {
        plan_id: payload.plan_id,
        type,
        title: payload.title || null,
        login: payload.login || null,
        password_encrypted: payload.password ? encryptText(payload.password) : null,
        license_key_encrypted: payload.license_key ? encryptText(payload.license_key) : null,
        extra_data_encrypted: payload.extra_data ? encryptText(payload.extra_data) : null,
        notes: payload.notes || null,
        status: 'available',
      });
      return json(200, { ok: true, item: row ? { ...row, password_encrypted: row.password_encrypted ? '***' : null, license_key_encrypted: row.license_key_encrypted ? '***' : null } : null });
    }
    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    return json(500, { ok: false, error: 'Server xatosi yoki encryption key sozlanmagan' });
  }
};
