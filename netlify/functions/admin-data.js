const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient, request, listTable, insertRow, updateRow, deleteRow, fetchPlan, toQuery } = require('../../shared/db');
const { sendMessage } = require('../../shared/telegram');

const { slugify } = require('../../shared/seo-page');

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

async function notifyPriceDrop(supabase, plan) {
  const { data: wishItems } = await request(supabase, 'wishlist', {
    query: toQuery({ select: 'user_telegram_id', plan_id: `eq.${plan.id}` }),
  });
  if (!wishItems?.length) return;
  const oldPrice = Number(plan.old_price || 0);
  const newPrice = Number(plan.price || 0);
  const text = `🔥 <b>Narx tushdi!</b>\n\n${plan.name}\n${oldPrice ? `<s>${oldPrice.toLocaleString('uz-UZ')}</s> → ` : ''}${newPrice.toLocaleString('uz-UZ')} UZS\n\nMini Appda xarid qiling!`;
  const sent = new Set();
  for (const w of wishItems) {
    if (sent.has(w.user_telegram_id)) continue;
    sent.add(w.user_telegram_id);
    await sendMessage(w.user_telegram_id, text, { parse_mode: 'HTML' }).catch(() => {});
  }
}

// promo_codes da sort_order ustuni yo'q, shuning uchun listTable ishlamaydi
// Tannarx ustuni (cost_price) migratsiyasi hali qo'llanmagan bo'lsa, PostgREST
// "Could not find the 'cost_price' column" deb rad etadi. Shunda reja tannarxsiz
// saqlanadi va admin ogohlantiriladi — reja saqlash buzilmaydi.
const COST_MIGRATION_HINT = 'Tannarx saqlanmadi: migrations/2026-10-12_plans-cost-price.sql hali qo‘llanmagan. Qolgan maydonlar saqlandi.';
async function saveWithoutMissingCost(save, row) {
  try {
    return { item: await save(row) };
  } catch (error) {
    if (!('cost_price' in row) || !/cost_price/.test(String(error?.message || ''))) throw error;
    const { cost_price: _omit, ...rest } = row;
    return { item: await save(rest), warning: COST_MIGRATION_HINT };
  }
}

// To'plam (bundle) tarkibi plans jadvalida emas, alohida plan_bundle_items
// jadvalida saqlanadi. Migratsiya hali qo'llanmagan bo'lsa (jadval yo'q),
// reja baribir saqlanadi — faqat tarkib yozilmaydi va admin ogohlantiriladi.
const BUNDLE_MIGRATION_HINT = 'To‘plam tarkibi saqlanmadi: migrations/2026-10-31_source-tracking-and-bundles.sql hali qo‘llanmagan. Qolgan maydonlar saqlandi.';

async function listBundleItems(supabase) {
  try {
    const { data } = await request(supabase, 'plan_bundle_items', {
      query: 'select=bundle_plan_id,child_plan_id,quantity,sort_order&order=sort_order.asc',
    });
    return data || [];
  } catch (error) {
    console.warn('listBundleItems warn:', error?.message);
    return [];
  }
}

// To'plam tarkibini TO'LIQ almashtiradi (o'chirib, qaytadan yozadi).
// Nima uchun shunday: admin formasi butun ro'yxatni yuboradi, qaysi qator
// qo'shilgan-u qaysisi olib tashlanganini hisoblash keraksiz murakkablik.
// Ro'yxat kichkina (2-5 qator), shuning uchun narxi ham yo'q.
async function replaceBundleItems(supabase, bundlePlanId, items) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      child_plan_id: String(item.child_plan_id || item.plan_id || '').trim(),
      quantity: Math.max(1, Math.min(10, Math.round(Number(item.quantity || 1)) || 1)),
      sort_order: index + 1,
    }))
    .filter((row) => row.child_plan_id && row.child_plan_id !== String(bundlePlanId));

  // Bitta reja ikki marta kiritilgan bo'lsa (unique cheklov buzilardi) —
  // miqdorlar qo'shiladi.
  const merged = new Map();
  for (const row of rows) {
    const prev = merged.get(row.child_plan_id);
    if (prev) prev.quantity = Math.min(10, prev.quantity + row.quantity);
    else merged.set(row.child_plan_id, row);
  }

  await request(supabase, 'plan_bundle_items', {
    method: 'DELETE',
    query: `bundle_plan_id=eq.${encodeURIComponent(bundlePlanId)}`,
  });
  const payload = [...merged.values()].map((row) => ({ ...row, bundle_plan_id: bundlePlanId }));
  if (payload.length) {
    await request(supabase, 'plan_bundle_items', { method: 'POST', body: payload });
  }
  return payload.length;
}

// Reja saqlangandan keyin to'plam tarkibini yozadi.
// `bundle_items` yuborilmagan bo'lsa tarkibga tegilmaydi (reja oddiy
// tahrirlangan — masalan narx o'zgargan — tarkib yo'qolib ketmasligi kerak).
async function saveBundle(supabase, savedPlan, rawItem = {}) {
  if (!savedPlan?.id || rawItem.bundle_items === undefined) return null;
  try {
    // To'plam belgisi olib tashlangan bo'lsa tarkib ham tozalanadi, aks holda
    // "to'plam emas"-u tarkibi bor g'alati holat qolardi.
    const items = rawItem.is_bundle === false ? [] : rawItem.bundle_items;
    await replaceBundleItems(supabase, savedPlan.id, items);
    return null;
  } catch (error) {
    console.warn('saveBundle warn:', error?.message);
    return BUNDLE_MIGRATION_HINT;
  }
}

async function listPromoCodes(supabase) {
  const { data } = await request(supabase, 'promo_codes', { query: 'select=*&order=created_at.desc' });
  return data || [];
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return unauthorized();
  const supabase = getAdminClient();

  try {
    if (event.httpMethod === 'GET') {
      const [categories, plans, promos, bundleItems] = await Promise.all([
        listTable(supabase, 'categories'),
        listTable(supabase, 'plans'),
        listPromoCodes(supabase).catch((error) => {
          console.warn('promo_codes list warning:', error?.message);
          return [];
        }),
        listBundleItems(supabase),
      ]);
      // Tannarx — faqat egasi uchun (operator foyda/marjani ko'rmaydi)
      const isOwner = requireOwner(event.headers);
      const visiblePlans = isOwner ? plans : plans.map(({ cost_price: _omit, ...p }) => p);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, categories, plans: visiblePlans, promos, bundleItems }) };
    }

    const payload = JSON.parse(event.body || '{}');

    const sanitizePlan = (item = {}) => {
      const allowed = ['manual', 'auto_account', 'license_key', 'instruction_only'];
      if (item.price !== undefined && Number.isNaN(Number(item.price))) throw badRequest('price numeric bo‘lishi kerak');
      if (item.old_price !== undefined && item.old_price !== null && item.old_price !== '' && Number.isNaN(Number(item.old_price))) throw badRequest('old_price numeric bo‘lishi kerak');
      if (item.delivery_type && !allowed.includes(item.delivery_type)) throw badRequest('delivery_type noto‘g‘ri');
      if (item.cost_price !== undefined && item.cost_price !== null && item.cost_price !== ''
        && !(Number(item.cost_price) >= 0)) throw badRequest('tannarx 0 yoki undan katta son bo‘lishi kerak');
      // bundle_items plans jadvalining ustuni EMAS — u alohida jadvalga
      // yoziladi (replaceBundleItems), shuning uchun reja qatoridan olib
      // tashlanadi. Aks holda PostgREST "noma'lum ustun" deb rad etardi.
      const { bundle_items: _bundleItems, ...planFields } = item;
      const out = {
        ...planFields,
        price: item.price !== undefined ? Number(item.price) : item.price,
        old_price: item.old_price === '' ? null : item.old_price === null || item.old_price === undefined ? item.old_price : Number(item.old_price),
        tags: Array.isArray(item.tags) ? item.tags : [],
      };
      if (item.cost_price !== undefined) out.cost_price = item.cost_price === '' || item.cost_price === null ? null : Number(item.cost_price);
      if (item.is_bundle !== undefined) out.is_bundle = Boolean(item.is_bundle);

      // slug — ochiq sahifa manzili (/obuna/<slug>). Bo'sh bo'lsa sahifa
      // ochilmaydi. Yozilgan bo'lsa nomdan avtomatik tozalanadi, chunki
      // URL da faqat kichik lotin harflari, raqam va chiziqcha bo'lishi kerak.
      if (item.slug !== undefined) {
        const slug = slugify(item.slug);
        if (item.slug && !slug) throw badRequest('slug faqat lotin harflari va raqamlardan iborat bo‘lishi kerak');
        out.slug = slug || null;
      }
      return out;
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

    // Yozish amallari — faqat egasi (operator faqat ko'radi)
    if (event.httpMethod !== 'GET' && !requireOwner(event.headers)) return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Faqat egasi uchun' }) };
    if (event.httpMethod === 'POST') {
      const table = resolveTable(payload.type);
      const { item, warning } = await saveWithoutMissingCost((row) => insertRow(supabase, table, row), sanitize(table, payload.item, { isCreate: true }));
      const bundleWarning = table === 'plans' ? await saveBundle(supabase, item, payload.item) : null;
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item, warning: warning || bundleWarning }) };
    }

    if (event.httpMethod === 'PUT') {
      const table = resolveTable(payload.type);
      const { id, ...item } = payload.item;

      // Narx tushishini aniqlash va wishlist foydalanuvchilarini xabardor qilish
      let oldPlan = null;
      if (table === 'plans' && item.price !== undefined) {
        oldPlan = await fetchPlan(supabase, id);
      }

      const { item: updated, warning } = await saveWithoutMissingCost((row) => updateRow(supabase, table, id, row), sanitize(table, item));

      if (oldPlan && updated && Number(updated.price) < Number(oldPlan.price)) {
        notifyPriceDrop(supabase, updated).catch((e) => console.warn('price drop notify warn:', e?.message));
      }

      const bundleWarning = table === 'plans' ? await saveBundle(supabase, updated || { id }, item) : null;
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item: updated, warning: warning || bundleWarning }) };
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
