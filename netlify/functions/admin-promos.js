const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient, request, toQuery, insertRow, updateRow, deleteRow } = require('../../shared/db');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

// Admin formadan kelgan xom promokod ma'lumotlarini DB ustunlariga moslaydi.
// Kod har doim katta harf (getPromoCode lookup ham katta harfda qidiradi).
function normalize(payload = {}) {
  const out = {};
  if (payload.code !== undefined) out.code = String(payload.code || '').trim().toUpperCase();
  if (payload.discount_type !== undefined) {
    out.discount_type = ['percent', 'fixed', 'cashback_percent'].includes(payload.discount_type)
      ? payload.discount_type
      : 'fixed';
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
  // Promokod qaysi tovarlarga amal qiladi. Bo'sh ro'yxat = hamma tovarga
  // (NULL sifatida saqlanadi, chunki tekshiruv NULL va bo'sh massivni bir xil
  // ko'radi). Faqat UUID ko'rinishidagi qiymatlar qabul qilinadi.
  if (payload.plan_ids !== undefined) {
    const ids = (Array.isArray(payload.plan_ids) ? payload.plan_ids : [])
      .map((id) => String(id || '').trim())
      .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    out.plan_ids = ids.length ? [...new Set(ids)] : null;
  }
  return out;
}

// PostgREST filtri uchun qiymatni xavfsizlash: vergul va qavs filtr sintaksisini
// buzadi, shuning uchun promokodni faqat ruxsat etilgan belgilar bilan cheklaymiz.
function safeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
}

// Promokod ishlatilish tarixi: qaysi buyurtmalarda qo'llangan, kim, qancha to'lagan.
// `promo_codes` jadvalida faqat `used_count` bor, shuning uchun tafsilot
// `orders.promo_code` bo'yicha yig'iladi.
async function promoUsage(db, rawCode) {
  const code = safeCode(rawCode);
  if (!code) return { code: '', orders: [], summary: null };

  const { data: orders } = await request(db, 'orders', {
    query: toQuery({
      select: 'order_number,user_telegram_id,plan_id,amount,unique_price,discount_amount,cashback_amount,status,created_at',
      promo_code: `eq.${code}`,
      order: 'created_at.desc',
      limit: 200,
    }),
  });
  const rows = orders || [];

  // Reja nomi va foydalanuvchi username'ini bitta so'rovda olib, xaritaga solamiz.
  const planIds = [...new Set(rows.map((o) => o.plan_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((o) => String(o.user_telegram_id)).filter(Boolean))];
  const [plansRes, usersRes] = await Promise.all([
    planIds.length
      ? request(db, 'plans', { query: `select=id,name&id=in.(${planIds.join(',')})` }).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
    userIds.length
      ? request(db, 'users', {
        query: `select=telegram_id,username,full_name&telegram_id=in.(${userIds.map(encodeURIComponent).join(',')})`,
      }).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
  ]);
  const planMap = Object.fromEntries((plansRes.data || []).map((p) => [p.id, p.name]));
  const userMap = Object.fromEntries((usersRes.data || []).map((u) => [String(u.telegram_id), u]));

  // Faqat haqiqatda pul kelgan buyurtmalar jamlanmaga kiradi — rad etilgan yoki
  // to'lanmagan buyurtma tushum emas.
  const PAID = new Set(['approved', 'completed', 'delivered']);
  let paidCount = 0;
  let revenue = 0;
  let discountTotal = 0;

  const list = rows.map((o) => {
    const user = userMap[String(o.user_telegram_id)] || null;
    const paid = Number(o.unique_price ?? o.amount ?? 0);
    const discount = Number(o.discount_amount || 0);
    const isPaid = PAID.has(String(o.status));
    if (isPaid) {
      paidCount += 1;
      revenue += paid;
      discountTotal += discount;
    }
    return {
      order_number: o.order_number,
      user_telegram_id: o.user_telegram_id,
      username: user?.username || null,
      full_name: user?.full_name || null,
      plan_name: planMap[o.plan_id] || '-',
      amount: paid,
      discount_amount: discount,
      cashback_amount: Number(o.cashback_amount || 0),
      status: o.status,
      is_paid: isPaid,
      created_at: o.created_at,
    };
  });

  return {
    code,
    orders: list,
    summary: {
      total: list.length,
      paid: paidCount,
      revenue,
      discount_total: discountTotal,
      unique_users: new Set(list.map((o) => String(o.user_telegram_id))).size,
    },
  };
}

// Testlar uchun ochiladi (filtrga injection oldini olish mantig'i).
exports._safeCode = safeCode;

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET' && event.queryStringParameters?.usage) {
      const usage = await promoUsage(db, event.queryStringParameters.usage);
      return json(200, { ok: true, ...usage });
    }
    if (event.httpMethod === 'GET') {
      const { data } = await request(db, 'promo_codes', { query: 'select=*&order=created_at.desc' });
      return json(200, { ok: true, promos: data || [] });
    }
    // Yozish amallari — faqat egasi (operator faqat ko'radi)
    if (event.httpMethod !== 'GET' && !requireOwner(event.headers)) return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Faqat egasi uchun' }) };
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
    console.error('admin-promos error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
