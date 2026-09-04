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
} = require('../../shared/db');
const { processApprovedDelivery } = require('../../shared/delivery-service');
const { settlePaidOrder } = require('../../shared/humo-payment-service');
const { processReferralPayout } = require('../../shared/referral-service');
const { sendMessage } = require('../../shared/telegram');

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

// Testlar uchun ochiladi.
exports._sanitizeSearch = sanitizeSearch;

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

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const status = params.status;
      // Ilgari limit qat'iy 50 edi va frontend uni oshirmasdi — 500+ buyurtmadan
      // faqat oxirgi 50 tasi ko'rinardi. Endi sahifalash bor (limit + offset).
      const limit = Math.min(Math.max(Number(params.limit || 50), 1), 500);
      const offset = Math.max(Number(params.offset || 0), 0);
      const query = { select: '*', order: 'created_at.desc', limit, offset };
      if (status) query.status = `eq.${status}`;

      // Qidiruv: buyurtma raqami yoki Telegram ID bo'yicha.
      const search = sanitizeSearch(params.search);
      if (search) {
        query.or = `(order_number.ilike.*${search}*,user_telegram_id.ilike.*${search}*)`;
      }

      const [{ data: orders, count }, plans] = await Promise.all([
        request(supabase, 'orders', { query: toQuery(query), headers: { Prefer: 'count=exact' } }),
        listTable(supabase, 'plans'),
      ]);
      const mapped = (orders || []).map((o) => ({ ...o, plan_name: plans.find((p) => p.id === o.plan_id)?.name || '-' }));
      return json(200, { ok: true, orders: mapped, total: count ?? mapped.length, limit, offset });
    }

    if (event.httpMethod === 'POST') {
      const { action, orderId } = JSON.parse(event.body || '{}');
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
