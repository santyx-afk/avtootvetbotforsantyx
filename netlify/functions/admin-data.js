const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, listTable, insertRow, updateRow, deleteRow } = require('../../shared/db');

const TABLES = { category: 'categories', plan: 'plans', promo: 'promo_codes' };

function unauthorized() {
  return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Unauthorized' }) };
}

// Validatsiya xatolari userga ko'rsatiladi, qolgani 'Server xatosi' bo'lib qoladi
function badRequest(message) {
  const error = new Error(message);
  error.expose = true;
  return error;
}

function resolveTable(type) {
  return TABLES[type] || 'plans';
}

// promo_codes da sort_order ustuni yo'q, shuning uchun listTable ishlamaydi
async function listPromoCodes(supabase) {
  const { data } = await request(supabase, 'promo_codes', { query: 'select=*&order=created_at.desc' });
  return data || [];
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return unauthorized();
  const supabase = getAdminClient();

  try {
    if (event.httpMethod === 'GET') {
      const [categories, plans, promos] = await Promise.all([
        listTable(supabase, 'categories'),
        listTable(supabase, 'plans'),
        listPromoCodes(supabase).catch((error) => {
          console.warn('promo_codes list warning:', error?.message);
          return [];
        }),
      ]);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, categories, plans, promos }) };
    }

    const payload = JSON.parse(event.body || '{}');

    const sanitizePlan = (item = {}) => {
      const allowed = ['manual', 'auto_account', 'license_key', 'instruction_only'];
      if (item.price !== undefined && Number.isNaN(Number(item.price))) throw badRequest('price numeric bo‘lishi kerak');
      if (item.old_price !== undefined && item.old_price !== null && item.old_price !== '' && Number.isNaN(Number(item.old_price))) throw badRequest('old_price numeric bo‘lishi kerak');
      if (item.delivery_type && !allowed.includes(item.delivery_type)) throw badRequest('delivery_type noto‘g‘ri');
      return {
        ...item,
        price: item.price !== undefined ? Number(item.price) : item.price,
        old_price: item.old_price === '' ? null : item.old_price === null || item.old_price === undefined ? item.old_price : Number(item.old_price),
        tags: Array.isArray(item.tags) ? item.tags : [],
      };
    };

    const sanitizePromo = (item = {}, { isCreate = false } = {}) => {
      const result = { ...item };

      if (isCreate && !result.code) throw badRequest('promo kod majburiy');
      if (result.code !== undefined) {
        const code = String(result.code).trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw badRequest('promo kod 3-32 ta harf, raqam, _ yoki - bo‘lishi kerak');
        result.code = code;
      }

      const type = result.discount_type === undefined ? null : String(result.discount_type);
      if (isCreate && !type) throw badRequest('discount_type majburiy (percent yoki fixed)');
      if (type !== null) {
        if (!['percent', 'fixed'].includes(type)) throw badRequest('discount_type percent yoki fixed bo‘lishi kerak');
        result.discount_type = type;
      }

      if (isCreate && result.discount_value === undefined) throw badRequest('discount_value majburiy');
      if (result.discount_value !== undefined) {
        const value = Number(result.discount_value);
        if (!Number.isFinite(value) || value <= 0) throw badRequest('discount_value noldan katta bo‘lishi kerak');
        if (type === 'percent' && value > 100) throw badRequest('percent chegirma 100 dan oshmasligi kerak');
        result.discount_value = value;
      }

      if (result.max_uses === '' || result.max_uses === null) {
        result.max_uses = null;
      } else if (result.max_uses !== undefined) {
        const max = Number(result.max_uses);
        if (!Number.isInteger(max) || max <= 0) throw badRequest('max_uses butun va noldan katta bo‘lishi kerak');
        result.max_uses = max;
      }

      if (result.expires_at === '' || result.expires_at === null) {
        result.expires_at = null;
      } else if (result.expires_at !== undefined) {
        // Faqat sana berilsa u kunning oxirigacha amal qiladi (/addpromo bilan bir xil)
        const raw = String(result.expires_at);
        const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
        if (Number.isNaN(date.getTime())) throw badRequest('expires_at sanasi noto‘g‘ri');
        result.expires_at = date.toISOString();
      }

      if (result.is_one_time !== undefined) result.is_one_time = Boolean(result.is_one_time);
      if (result.is_active !== undefined) result.is_active = Boolean(result.is_active);

      // used_count faqat tizim tomonidan oshiriladi
      delete result.used_count;
      if (isCreate) {
        result.is_active = result.is_active === undefined ? true : result.is_active;
        result.used_count = 0;
      }
      return result;
    };

    const sanitize = (table, item, options) => {
      if (table === 'plans') return sanitizePlan(item);
      if (table === 'promo_codes') return sanitizePromo(item, options);
      return item;
    };

    if (event.httpMethod === 'POST') {
      const table = resolveTable(payload.type);
      const item = await insertRow(supabase, table, sanitize(table, payload.item, { isCreate: true }));
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item }) };
    }

    if (event.httpMethod === 'PUT') {
      const table = resolveTable(payload.type);
      const { id, ...item } = payload.item;
      const updated = await updateRow(supabase, table, id, sanitize(table, item));
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item: updated }) };
    }

    if (event.httpMethod === 'DELETE') {
      const table = resolveTable(payload.type);
      await deleteRow(supabase, table, payload.id);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (error) {
    console.error('admin-data error', error);
    const status = error?.expose ? 400 : 500;
    return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: error?.expose ? error.message : 'Server xatosi' }) };
  }
};
