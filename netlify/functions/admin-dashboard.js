const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, countRows, listRecentEvents, listEventsByType, listTable, request, toQuery } = require('../../shared/db');

function aggregate(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, total]) => ({ id, total }));
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false }) };
  }

  const supabase = getAdminClient();
  try {
    const [totalUsers, totalClicks, totalPaymentOpens, categoryRows, planRows, paymentRows, eventLogs, categories, plans, ordersResp, inventoryResp] = await Promise.all([
      countRows(supabase, 'users'),
      countRows(supabase, 'analytics_events'),
      countRows(supabase, 'analytics_events', 'event_type=eq.payment_opened'),
      listEventsByType(supabase, 'category_opened', 'category_id'),
      listEventsByType(supabase, 'plan_opened', 'plan_id'),
      listEventsByType(supabase, 'payment_opened', 'plan_id'),
      listRecentEvents(supabase, 20),
      listTable(supabase, 'categories'),
      listTable(supabase, 'plans'),
      request(supabase, 'orders', { query: toQuery({ select: 'id,amount,status,plan_id,created_at,delivery_status', limit: 500, order: 'created_at.desc' }) }),
      request(supabase, 'inventory_items', { query: toQuery({ select: 'plan_id,status', limit: 2000 }) }),
    ]);
    const orders = ordersResp.data || [];
    const inventory = inventoryResp.data || [];
    const now = new Date();
    const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
    const startWeek = new Date(now); startWeek.setDate(now.getDate() - 7);
    const startMonth = new Date(now); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const resolveName = (items, entry) => ({ ...entry, name: items.find((item) => item.id === entry.id)?.name || entry.id });
    const inDone = new Set(['approved', 'completed']);
    const revenue = (since) => orders.filter((o) => inDone.has(o.status) && new Date(o.created_at) >= since).reduce((s, o) => s + Number(o.amount || 0), 0);
    const statusCount = (status) => orders.filter((o) => o.status === status).length;
    const soldAgg = aggregate(orders.filter((o) => inDone.has(o.status)).map((o) => ({ plan_id: o.plan_id })), 'plan_id').map((item) => resolveName(plans, item));
    const availableByPlan = inventory.reduce((acc, row) => {
      if (!acc[row.plan_id]) acc[row.plan_id] = 0;
      if (row.status === 'available') acc[row.plan_id] += 1;
      return acc;
    }, {});
    const lowStockPlans = Object.entries(availableByPlan).filter(([, c]) => c <= 3).map(([id, total]) => ({ id, total, name: plans.find((p) => p.id === id)?.name || id }));

    const mostViewedCategories = aggregate(categoryRows, 'category_id').map((item) => resolveName(categories, item));
    const mostViewedPlans = aggregate(planRows, 'plan_id').map((item) => resolveName(plans, item));
    const mostPaymentClicks = aggregate(paymentRows, 'plan_id').map((item) => resolveName(plans, item));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        stats: {
          totalUsers,
          totalClicks,
          totalPaymentOpens,
          mostViewedCategories,
          mostViewedPlans,
          mostPaymentClicks,
          topSoldPlans: soldAgg,
          lowStockPlans,
          revenueToday: revenue(startDay),
          revenueWeek: revenue(startWeek),
          revenueMonth: revenue(startMonth),
          pendingPaymentCount: statusCount('pending_payment'),
          paymentUploadedCount: statusCount('payment_uploaded'),
          approvedCount: statusCount('approved'),
          waitingStockCount: orders.filter((o) => o.delivery_status === 'waiting_stock').length,
          completedCount: statusCount('completed'),
          rejectedCount: statusCount('rejected'),
          eventLogs,
        },
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: error.message }) };
  }
};
