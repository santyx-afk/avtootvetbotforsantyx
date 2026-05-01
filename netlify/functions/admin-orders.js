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
} = require('../../shared/db');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
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
      if (action === 'approve') return json(200, await approveOrder(supabase, orderId));
      if (action === 'reject') return json(200, await rejectOrder(supabase, orderId));
      if (action === 'retry_delivery') return json(200, { ok: true, order: await retryDeliveryForOrder(supabase, orderId) });
      if (action === 'complete') return json(200, { ok: true, order: await updateOrderStatus(supabase, orderId, 'completed') });
      return json(400, { ok: false, error: 'Noma’lum action' });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    return json(500, { ok: false, error: 'Server xatosi' });
  }
};
