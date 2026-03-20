const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, countRows, listRecentEvents, listEventsByType, listTable } = require('../../shared/db');

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
    const [totalUsers, totalClicks, totalPaymentOpens, categoryRows, planRows, paymentRows, eventLogs, categories, plans] = await Promise.all([
      countRows(supabase, 'users'),
      countRows(supabase, 'analytics_events'),
      countRows(supabase, 'analytics_events', 'event_type=eq.payment_opened'),
      listEventsByType(supabase, 'category_opened', 'category_id'),
      listEventsByType(supabase, 'plan_opened', 'plan_id'),
      listEventsByType(supabase, 'payment_opened', 'plan_id'),
      listRecentEvents(supabase, 20),
      listTable(supabase, 'categories'),
      listTable(supabase, 'plans'),
    ]);

    const resolveName = (items, entry) => ({ ...entry, name: items.find((item) => item.id === entry.id)?.name || entry.id });
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
          eventLogs,
        },
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: error.message }) };
  }
};
