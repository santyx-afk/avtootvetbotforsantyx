const { requireAdmin } = require('../../shared/auth');
const {
  getAdminClient,
  request,
  toQuery,
  approveOrder,
  rejectOrder,
  updateOrderStatus,
  retryDeliveryForOrder,
  listTable,
  getOrderById,
  fetchPlan,
  creditOrderCashback,
  markOrderPaidManually,
  createDeliveryLog,
  createSubscriptionFromOrder,
  createAuditLog,
} = require('../../shared/db');
const { processApprovedDelivery } = require('../../shared/delivery-service');
const { settlePaidOrder } = require('../../shared/humo-payment-service');
const { processReferralPayout } = require('../../shared/referral-service');
const { sendMessage } = require('../../shared/telegram');
const { escapeHtml } = require('../../shared/messages');
const { markOrderNotification } = require('../../shared/admin-notify');

// Sana filtri faqat YYYY-MM-DD ko'rinishida qabul qilinadi.
function safeDate(value) {
  const v = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

// Buyurtmalar ro'yxati uchun PostgREST filtrlari. Bir nechta shart (sana
// oralig'i, tur, qidiruv) bitta `and=(...)` guruhiga yig'iladi — bir xil
// ustunga ikki filtr (gte + lte) oddiy query obyektida sig'maydi.
function buildOrderFilters({ status, from, to, type, search }) {
  const query = {};
  const parts = [];
  if (status) query.status = `eq.${status}`;
  // Toshkent vaqti (UTC+5) bo'yicha kun chegaralari
  if (from) parts.push(`created_at.gte.${from}T00:00:00+05:00`);
  if (to) parts.push(`created_at.lte.${to}T23:59:59.999+05:00`);
  if (type === 'topup') query.order_type = 'eq.topup';
  else if (type === 'purchase') parts.push('or(order_type.eq.purchase,order_type.is.null)');
  if (search) parts.push(`or(order_number.ilike.*${search}*,user_telegram_id.ilike.*${search}*)`);
  if (parts.length) query.and = `(${parts.join(',')})`;
  return query;
}

const ATTENTION_COLS = 'id,order_number,user_telegram_id,plan_id,unique_price,amount,status,delivery_status,delivery_error,delivery_attempts,created_at,order_type';

// E'tibor talab qiladigan buyurtmalar: qo'lda ulash kerak, zaxira kutilmoqda,
// yetkazish xato, chek tekshirilmoqda, istisno navbati. Har biri sababi bilan.
async function attentionList(supabase) {
  const [manualRes, stockRes, failedRes, receiptRes, exqRes, retryRes, plans] = await Promise.all([
    request(supabase, 'orders', { query: toQuery({ select: ATTENTION_COLS, status: 'eq.approved', delivery_status: 'eq.manual_required', order: 'created_at.desc', limit: 50 }) }).catch(() => ({ data: [] })),
    request(supabase, 'orders', { query: toQuery({ select: ATTENTION_COLS, delivery_status: 'eq.waiting_stock', status: 'not.in.(completed,rejected,cancelled,expired)', order: 'created_at.desc', limit: 50 }) }).catch(() => ({ data: [] })),
    request(supabase, 'orders', { query: toQuery({ select: ATTENTION_COLS, delivery_status: 'eq.failed', status: 'in.(delivering,payment_detected,approved)', order: 'created_at.desc', limit: 50 }) }).catch(() => ({ data: [] })),
    request(supabase, 'orders', { query: toQuery({ select: ATTENTION_COLS, status: 'in.(payment_uploaded,checking)', order: 'created_at.desc', limit: 50 }) }).catch(() => ({ data: [] })),
    request(supabase, 'exception_queue', { query: toQuery({ select: 'order_id,reason,created_at', status: 'eq.open', order: 'created_at.desc', limit: 50 }) }).catch(() => ({ data: [] })),
    request(supabase, 'delivery_retry_queue', { query: toQuery({ select: 'order_id,retry_count,next_retry_at,reason', status: 'eq.pending', limit: 50 }) }).catch(() => ({ data: [] })),
    listTable(supabase, 'plans').catch(() => []),
  ]);

  const REASONS = {
    manual: 'Qo‘lda ulash kerak',
    stock: 'Zaxirada akkaunt yo‘q',
    failed: 'Yetkazish xato',
    receipt: 'Chek tekshirilmoqda',
    exception: 'Istisno navbati',
    retry: 'Qayta urinilmoqda',
  };
  const byId = new Map();
  const add = (order, kind, extra = '') => {
    if (!order?.id) return;
    const entry = byId.get(order.id) || { order, kinds: [], notes: [] };
    if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
    if (extra) entry.notes.push(extra);
    byId.set(order.id, entry);
  };
  for (const o of manualRes.data || []) add(o, 'manual');
  for (const o of stockRes.data || []) add(o, 'stock');
  for (const o of failedRes.data || []) add(o, 'failed', o.delivery_error || '');
  for (const o of receiptRes.data || []) add(o, 'receipt');

  // Istisno va retry navbatlaridagi buyurtmalar alohida o'qiladi (yuqoridagi
  // ro'yxatlarda bo'lmasligi mumkin). Yakunlanganlari ko'rsatilmaydi.
  const extraIds = [...new Set([...(exqRes.data || []), ...(retryRes.data || [])].map((r) => r.order_id).filter((id) => id && !byId.has(id)))];
  let extraOrders = [];
  if (extraIds.length) {
    ({ data: extraOrders } = await request(supabase, 'orders', {
      query: toQuery({ select: ATTENTION_COLS, id: `in.(${extraIds.join(',')})` }),
    }).catch(() => ({ data: [] })));
  }
  const extraMap = new Map((extraOrders || []).map((o) => [o.id, o]));
  const closed = new Set(['completed', 'rejected', 'cancelled', 'expired']);
  for (const r of exqRes.data || []) {
    const o = byId.get(r.order_id)?.order || extraMap.get(r.order_id);
    if (o && !closed.has(o.status)) add(o, 'exception', r.reason || '');
  }
  for (const r of retryRes.data || []) {
    const o = byId.get(r.order_id)?.order || extraMap.get(r.order_id);
    if (o && !closed.has(o.status)) add(o, 'retry', `${Number(r.retry_count || 0)}-urinish`);
  }

  const userIds = [...new Set([...byId.values()].map((e) => String(e.order.user_telegram_id)).filter((id) => /^\d{1,20}$/.test(id)))];
  let users = [];
  if (userIds.length) {
    ({ data: users } = await request(supabase, 'users', {
      query: `select=telegram_id,username,full_name&telegram_id=in.(${userIds.join(',')})&limit=500`,
    }).catch(() => ({ data: [] })));
  }
  const userMap = new Map((users || []).map((u) => [String(u.telegram_id), u]));

  return [...byId.values()]
    .sort((a, b) => new Date(b.order.created_at) - new Date(a.order.created_at))
    .map(({ order, kinds, notes }) => ({
      id: order.id,
      order_number: order.order_number,
      user_telegram_id: order.user_telegram_id,
      user: userMap.get(String(order.user_telegram_id)) || { telegram_id: order.user_telegram_id },
      plan_id: order.plan_id,
      plan_name: plans.find((p) => p.id === order.plan_id)?.name || '-',
      amount: Number(order.unique_price ?? order.amount ?? 0),
      status: order.status,
      delivery_status: order.delivery_status,
      kinds,
      reasons: kinds.map((k) => REASONS[k] || k),
      note: [...new Set(notes)].join('; '),
      created_at: order.created_at,
    }));
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Mijozga bot orqali xabar — xabar ketmasa ham admin amali muvaffaqiyatli qoladi
// (matnlar bot-service'dagi inline approve/reject oqimi bilan bir xil).
// Serverless'da javob qaytgach kutilmagan promise uzilib qolishi mumkin, shuning
// uchun bu funksiya doim await bilan chaqiriladi.
async function notifyCustomer(telegramId, text) {
  if (!telegramId) return;
  await sendMessage(String(telegramId), text, null).catch((e) => console.warn('customer notify warn:', e?.message));
}

// PostgREST `or=(...)` filtri qavs, vergul, yulduzcha va qo'shtirnoq bilan
// ajratiladi — qidiruv matnida ular qolsa filtr sintaksisi buziladi (yoki
// begona shart qo'shib yuboriladi). Shuning uchun ular butunlay olib tashlanadi.
function sanitizeSearch(value) {
  return String(value || '').trim().replace(/[(),*"\\]/g, '').slice(0, 64);
}

// Bitta buyurtmaning to'liq tafsiloti: mijoz, reja, pul taqsimoti (promo,
// chegirma, balans, cashback) va eng muhimi — qaysi inventar birligi (akkaunt
// yoki kalit) yetkazilgani. Kredensiallarning O'ZI qaytarilmaydi: faqat qaysi
// akkaunt ketgani ko'rsatiladi, ichini ochish Inventory bo'limidagi "Ko'rish"
// tugmasi orqali (audit izini bitta joyda ushlab turish uchun).
async function orderDetail(supabase, orderId) {
  const { data } = await request(supabase, 'orders', {
    query: `select=*&id=eq.${encodeURIComponent(orderId)}&limit=1`,
  });
  const order = data?.[0];
  if (!order) return null;

  const [planRes, userRes, invRes, itemsRes] = await Promise.all([
    order.plan_id
      ? request(supabase, 'plans', { query: `select=name&id=eq.${encodeURIComponent(order.plan_id)}&limit=1` }).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
    order.user_telegram_id
      ? request(supabase, 'users', {
        query: `select=telegram_id,username,full_name,phone&telegram_id=eq.${encodeURIComponent(order.user_telegram_id)}&limit=1`,
      }).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
    // Inventar birligi ikki yo'l bilan bog'lanadi: orders.inventory_item_id yoki
    // inventory_items.assigned_order_id. Ikkalasini ham tekshiramiz.
    order.inventory_item_id
      ? request(supabase, 'inventory_items', {
        query: `select=id,type,login,status,reserved_at,delivered_at,sold_at&id=eq.${encodeURIComponent(order.inventory_item_id)}&limit=1`,
      }).catch(() => ({ data: [] }))
      : request(supabase, 'inventory_items', {
        query: `select=id,type,login,status,reserved_at,delivered_at,sold_at&assigned_order_id=eq.${encodeURIComponent(order.id)}&limit=5`,
      }).catch(() => ({ data: [] })),
    request(supabase, 'order_items', {
      query: `select=quantity,unit_price,total_price,delivery_status,delivery_error,delivered_at&order_id=eq.${encodeURIComponent(order.id)}`,
    }).catch(() => ({ data: [] })),
  ]);

  const user = userRes.data?.[0] || null;
  const inventory = (invRes.data || []).map((i) => ({
    id: i.id,
    type: i.type,
    // Login to'liq ko'rsatilmaydi — ro'yxatdagi maskalash bilan bir xil.
    login_masked: i.login ? `${String(i.login).slice(0, 2)}***` : null,
    status: i.status,
    reserved_at: i.reserved_at,
    delivered_at: i.delivered_at,
    sold_at: i.sold_at,
  }));

  return {
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    order_type: order.order_type || 'purchase',
    plan_name: planRes.data?.[0]?.name || '-',
    user: {
      telegram_id: order.user_telegram_id,
      username: user?.username || null,
      full_name: user?.full_name || null,
      phone: user?.phone || null,
    },
    money: {
      base_price: Number(order.base_price || 0),
      amount: Number(order.unique_price ?? order.amount ?? 0),
      expected_amount: Number(order.expected_amount || 0),
      promo_code: order.promo_code || null,
      discount_amount: Number(order.discount_amount || 0),
      balance_used: Number(order.balance_used || 0),
      cashback_amount: Number(order.cashback_amount || 0),
      payment_method: order.payment_method || null,
      payment_source: order.payment_source || null,
    },
    delivery: {
      status: order.delivery_status || null,
      attempts: Number(order.delivery_attempts || 0),
      error: order.delivery_error || null,
      items: inventory,
      order_items: itemsRes.data || [],
    },
    timeline: {
      created_at: order.created_at,
      receipt_uploaded_at: order.receipt_uploaded_at,
      paid_at: order.paid_at,
      approved_at: order.approved_at,
      rejected_at: order.rejected_at,
      delivered_at: order.delivered_at,
      completed_at: order.completed_at,
      expires_at: order.expires_at,
    },
    admin_comment: order.admin_comment || null,
  };
}

// Buyurtmani mijozga xabarsiz yakunlash (tashqarida hal qilingan eski
// buyurtmalar uchun). Faqat to'lovi kelgan buyurtma yopiladi — to'lov
// kutilayotganini "yopish" chalkashlik (u expired bo'lishi kerak).
async function closeOrderSilently(supabase, orderId) {
  const order = await getOrderById(supabase, orderId);
  if (!order) return { ok: false, status: 404, error: 'Buyurtma topilmadi' };
  if (['rejected', 'cancelled', 'expired'].includes(order.status)) return { ok: false, error: 'Buyurtma allaqachon yopiq' };
  if (order.status === 'completed' && order.delivery_status === 'delivered') return { ok: false, error: 'Buyurtma allaqachon yakunlangan' };
  if (['waiting_payment', 'pending_payment'].includes(order.status)) {
    return { ok: false, error: 'To‘lov kelmagan buyurtma yopilmaydi — u muddati o‘tganda o‘zi bekor bo‘ladi' };
  }
  const now = new Date().toISOString();
  const completed = await updateOrderStatus(supabase, orderId, 'completed', {
    delivery_status: 'delivered',
    delivered_at: order.delivered_at || now,
    completed_at: now,
    delivery_error: null,
    admin_comment: [order.admin_comment, 'Paneldan xabarsiz yopildi'].filter(Boolean).join(' | '),
  });
  await request(supabase, 'order_items', {
    method: 'PATCH',
    query: `order_id=eq.${encodeURIComponent(orderId)}&delivery_status=neq.delivered`,
    body: { delivery_status: 'delivered', delivered_at: now, updated_at: now },
  }).catch(() => {});
  await request(supabase, 'exception_queue', { method: 'PATCH', query: `order_id=eq.${encodeURIComponent(orderId)}&status=eq.open`, body: { status: 'resolved', resolved_at: now } }).catch(() => {});
  await request(supabase, 'delivery_retry_queue', { method: 'PATCH', query: `order_id=eq.${encodeURIComponent(orderId)}&status=eq.pending`, body: { status: 'completed', completed_at: now, updated_at: now } }).catch(() => {});
  await createAuditLog(supabase, { order_id: orderId, user_telegram_id: order.user_telegram_id, action: 'closed_silently', status: 'completed', metadata: { previous_status: order.status, previous_delivery: order.delivery_status } });
  await markOrderNotification(supabase, orderId, '✅ Paneldan yopildi (xabarsiz)').catch(() => {});
  return { ok: true, order: completed || order };
}

// Testlar uchun ochiladi.
exports._sanitizeSearch = sanitizeSearch;
exports._buildOrderFilters = buildOrderFilters;
exports._safeDate = safeDate;

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const supabase = getAdminClient();
  try {
    // Bitta buyurtma tafsiloti: qaysi akkaunt ketgan, kimga, qachon.
    if (event.httpMethod === 'GET' && event.queryStringParameters?.order_id) {
      const detail = await orderDetail(supabase, event.queryStringParameters.order_id);
      if (!detail) return json(404, { ok: false, error: 'Buyurtma topilmadi' });
      return json(200, { ok: true, detail });
    }

    // E'tibor talab qiladigan buyurtmalar (Dashboard bloki)
    if (event.httpMethod === 'GET' && event.queryStringParameters?.attention) {
      return json(200, { ok: true, items: await attentionList(supabase) });
    }

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      // Ilgari limit qat'iy 50 edi va frontend uni oshirmasdi — 500+ buyurtmadan
      // faqat oxirgi 50 tasi ko'rinardi. Endi sahifalash bor (limit + offset).
      const limit = Math.min(Math.max(Number(params.limit || 50), 1), 500);
      const offset = Math.max(Number(params.offset || 0), 0);
      const query = {
        select: '*',
        order: 'created_at.desc',
        limit,
        offset,
        // Holat, sana oralig'i (Toshkent kuni), tur (xarid/to'ldirish) va
        // qidiruv (buyurtma raqami yoki Telegram ID).
        ...buildOrderFilters({
          status: params.status,
          from: safeDate(params.from),
          to: safeDate(params.to),
          type: ['purchase', 'topup'].includes(params.type) ? params.type : '',
          search: sanitizeSearch(params.search),
        }),
      };

      const [{ data: orders, count }, plans] = await Promise.all([
        request(supabase, 'orders', { query: toQuery(query), headers: { Prefer: 'count=exact' } }),
        listTable(supabase, 'plans'),
      ]);
      const mapped = (orders || []).map((o) => ({ ...o, plan_name: plans.find((p) => p.id === o.plan_id)?.name || '-' }));
      return json(200, { ok: true, orders: mapped, total: count ?? mapped.length, limit, offset });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, orderId } = body;
      // Eski (N kundan oldingi) muammoli buyurtmalarni bittada xabarsiz yopish
      if (action === 'close_stale') {
        const days = Math.min(365, Math.max(1, Math.round(Number(body.days || 30))));
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const items = (await attentionList(supabase)).filter((it) => new Date(it.created_at).getTime() < cutoff);
        let closed = 0;
        const errors = [];
        for (const it of items) {
          const res = await closeOrderSilently(supabase, it.id);
          if (res.ok) closed += 1;
          else errors.push(`#${it.order_number}: ${res.error}`);
        }
        return json(200, { ok: true, closed, total: items.length, errors });
      }
      if (!orderId || !action) return json(400, { ok: false, error: 'orderId va action talab qilinadi' });
      // "To'lov keldi" — tizim aniqlamagan to'lovni admin qo'lda tasdiqlaydi.
      // Faqat to'lov kutilayotgan va muddati o'tmagan buyurtma (bot tugmasi
      // bilan bir xil qoida). Keyin oddiy to'lov kabi yetkaziladi.
      if (action === 'mark_paid') {
        const res = await markOrderPaidManually(supabase, orderId, 'web_admin');
        if (!res.ok) {
          const messages = {
            not_found: 'Buyurtma topilmadi',
            invalid_status: 'Buyurtma to‘lov kutish holatida emas',
            expired: 'Muddat o‘tgan — mijoz qayta buyurtma bersin',
            already_processed: 'Buyurtma allaqachon qayta ishlangan',
          };
          return json(400, { ...res, error: messages[res.reason] || 'Tasdiqlab bo‘lmadi' });
        }
        const amount = Number(res.order.unique_price || res.order.amount || 0);
        const settled = await settlePaidOrder({
          supabase,
          order: res.order,
          amount,
          messageKey: res.order.payment_message_id,
          adminLabel: 'admin panel',
        });
        return json(200, {
          ok: true,
          order: await getOrderById(supabase, orderId),
          delivery: settled?.delivery || null,
          topup: Boolean(settled?.topup),
        });
      }
      if (action === 'approve') {
        const approved = await approveOrder(supabase, orderId);
        if (!approved.ok) {
          const messages = {
            not_found: 'Buyurtma topilmadi',
            already_processed: 'Buyurtma allaqachon ko’rib chiqilgan',
            invalid_status: 'Approve faqat payment_uploaded yoki checking statusdagi buyurtmaga ishlaydi',
          };
          return json(400, { ...approved, error: messages[approved.reason] || 'Approve bajarilmadi' });
        }
        const delivery = await processApprovedDelivery({ supabase, order: approved.order, adminTelegramId: 'web_admin' });
        if (!delivery?.ok) {
          return json(500, { ok: false, error: delivery?.admin_message || delivery?.message || 'Delivery xatosi', order: await getOrderById(supabase, orderId), delivery });
        }
        // Referal bonusi + promo cashback (ikkalasi ham idempotent)
        await processReferralPayout(supabase, approved.order).catch((e) => console.warn('referral payout warn:', e?.message));
        await creditOrderCashback(supabase, approved.order).catch((e) => console.warn('cashback warn:', e?.message));
        await notifyCustomer(approved.order.user_telegram_id, `🎉 Buyurtmangiz #${approved.order.order_number} tasdiqlandi!`);
        return json(200, { ...approved, delivery });
      }
      if (action === 'reject') {
        const rejected = await rejectOrder(supabase, orderId);
        if (!rejected.ok) {
          const messages = {
            not_found: 'Buyurtma topilmadi',
            already_processed: 'Buyurtma allaqachon ko’rib chiqilgan',
          };
          return json(400, { ...rejected, error: messages[rejected.reason] || 'Reject bajarilmadi' });
        }
        await notifyCustomer(rejected.order.user_telegram_id, `❌ Buyurtmangiz #${rejected.order.order_number} rad etildi. Savollar bo'lsa adminga murojaat qiling.`);
        return json(200, rejected);
      }
      // Qo'lda yetkazish: admin login/parol yoki yo'riqnomani yozadi, u mijozga
      // bot orqali ketadi va buyurtma yakunlanadi. Matn bazada saqlanmaydi
      // (kredensiallar audit jurnaliga tushmasin) — faqat yetkazilgani qayd etiladi.
      if (action === 'deliver_manual') {
        const text = String(body.text || '').trim().slice(0, 3000);
        if (!text) return json(400, { ok: false, error: 'Mijozga yuboriladigan matn bo‘sh' });
        const order = await getOrderById(supabase, orderId);
        if (!order) return json(404, { ok: false, error: 'Buyurtma topilmadi' });
        if (['rejected', 'cancelled', 'expired'].includes(order.status)) {
          return json(400, { ok: false, error: 'Bekor qilingan yoki muddati o‘tgan buyurtmani yetkazib bo‘lmaydi' });
        }
        // To'lovi kelmagan buyurtma yetkazilmaydi (panel tugmani yashiradi,
        // lekin qoida server tomonda ham turishi shart).
        if (['waiting_payment', 'pending_payment'].includes(order.status)) {
          return json(400, { ok: false, error: 'To‘lov hali kelmagan — avval "To‘lov keldi" deb tasdiqlang' });
        }
        if (['payment_uploaded', 'checking'].includes(order.status)) {
          return json(400, { ok: false, error: 'Chek tekshirilmoqda — avval Approve qiling' });
        }
        if (String(order.order_type || 'purchase') === 'topup') {
          return json(400, { ok: false, error: 'Balans to‘ldirish buyurtmasi yetkazilmaydi' });
        }
        if (order.status === 'completed' && order.delivery_status === 'delivered') {
          return json(400, { ok: false, error: 'Buyurtma allaqachon yetkazilgan' });
        }
        const plan = order.plan_id ? await fetchPlan(supabase, order.plan_id).catch(() => null) : null;
        const message = [
          `✅ <b>Buyurtmangiz #${escapeHtml(order.order_number)} tayyor!</b>`,
          plan ? `📦 ${escapeHtml(plan.name)}` : null,
          '',
          escapeHtml(text),
          '',
          '⚠️ Ma’lumotlarni hech kimga bermang.',
        ].filter((line) => line !== null).join('\n');
        try {
          await sendMessage(String(order.user_telegram_id), message, null);
        } catch (error) {
          // Yuborilmagan bo'lsa buyurtma "yetkazilgan" deb belgilanmaydi.
          return json(502, { ok: false, error: `Mijozga yuborib bo‘lmadi: ${error.message}` });
        }
        const now = new Date().toISOString();
        const completed = await updateOrderStatus(supabase, orderId, 'completed', {
          delivery_status: 'delivered', delivered_at: now, completed_at: now, delivery_error: null,
        });
        const done = completed || order;
        await request(supabase, 'order_items', {
          method: 'PATCH',
          query: `order_id=eq.${encodeURIComponent(orderId)}&delivery_status=neq.delivered`,
          body: { delivery_status: 'delivered', delivered_at: now, updated_at: now },
        }).catch(() => {});
        await createDeliveryLog(supabase, {
          order_id: orderId, user_telegram_id: order.user_telegram_id, plan_id: plan?.id || null,
          delivery_type: 'manual', admin_telegram_id: 'web_admin', status: 'delivered', delivered_at: now,
        }).catch(() => {});
        await createAuditLog(supabase, { order_id: orderId, user_telegram_id: order.user_telegram_id, action: 'manual_delivered', status: 'completed', metadata: { chars: text.length } });
        if (plan) await createSubscriptionFromOrder(supabase, done, plan);
        // Navbatlardagi yozuvlar yopiladi — Dashboard'da qayta chiqmasin.
        await request(supabase, 'exception_queue', { method: 'PATCH', query: `order_id=eq.${encodeURIComponent(orderId)}&status=eq.open`, body: { status: 'resolved', resolved_at: now } }).catch(() => {});
        await request(supabase, 'delivery_retry_queue', { method: 'PATCH', query: `order_id=eq.${encodeURIComponent(orderId)}&status=eq.pending`, body: { status: 'completed', completed_at: now, updated_at: now } }).catch(() => {});
        await processReferralPayout(supabase, done).catch((e) => console.warn('referral payout warn:', e?.message));
        await creditOrderCashback(supabase, done).catch((e) => console.warn('cashback warn:', e?.message));
        await markOrderNotification(supabase, orderId, '📦 Qo‘lda yetkazildi (admin panel)').catch(() => {});
        return json(200, { ok: true, order: done });
      }
      // Xabarsiz yopish: buyurtma tashqarida (Telegram orqali qo'lda) hal
      // qilingan, tizim bilmay qolgan. Mijozga hech narsa ketmaydi, bonus/
      // cashback hisoblanmaydi — faqat holat yakunlanadi va navbatlar yopiladi.
      if (action === 'close_silent') {
        const closed = await closeOrderSilently(supabase, orderId);
        if (!closed.ok) return json(closed.status || 400, { ok: false, error: closed.error });
        return json(200, { ok: true, order: closed.order });
      }
      if (action === 'retry_delivery') {
        const order = await retryDeliveryForOrder(supabase, orderId);
        if (!order) return json(404, { ok: false, error: 'Buyurtma topilmadi' });
        const delivery = await processApprovedDelivery({ supabase, order, adminTelegramId: 'web_admin' });
        return json(200, { ok: delivery.ok, order: await getOrderById(supabase, orderId), delivery });
      }
      if (action === 'complete') {
        const order = await getOrderById(supabase, orderId);
        if (!order) return json(404, { ok: false, error: 'Buyurtma topilmadi' });
        const plan = await fetchPlan(supabase, order.plan_id);
        if (order.delivery_status === 'waiting_approval' && ['auto_account', 'license_key'].includes(plan?.delivery_type)) {
          return json(400, { ok: false, error: 'Inventory delivery tugallanmagan. Avval retry delivery qiling.' });
        }
        const completed = await updateOrderStatus(supabase, orderId, 'completed', { completed_at: new Date().toISOString() });
        return json(200, { ok: true, order: completed });
      }
      return json(400, { ok: false, error: 'Noma’lum action' });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('admin-orders error', error);
    return json(500, { ok: false, error: 'Server xatosi' });
  }
};
