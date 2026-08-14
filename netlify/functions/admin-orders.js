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
} = require('../../shared/db');
const { processApprovedDelivery } = require('../../shared/delivery-service');
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

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const supabase = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const status = event.queryStringParameters?.status;
      const limit = Number(event.queryStringParameters?.limit || 50);
      const query = { select: '*', order: 'created_at.desc', limit };
      if (status) query.status = `eq.${status}`;
      const { data: orders } = await request(supabase, 'orders', { query: toQuery(query) });
      const plans = await listTable(supabase, 'plans');
      const mapped = (orders || []).map((o) => ({ ...o, plan_name: plans.find((p) => p.id === o.plan_id)?.name || '-' }));
      return json(200, { ok: true, orders: mapped });
    }

    if (event.httpMethod === 'POST') {
      const { action, orderId } = JSON.parse(event.body || '{}');
      if (!orderId || !action) return json(400, { ok: false, error: 'orderId va action talab qilinadi' });
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
    return json(500, { ok: false, error: 'Server xatosi' });
  }
};
