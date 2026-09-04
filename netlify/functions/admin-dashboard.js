const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, countRows, listRecentEvents, listEventsByType, listTable, request, toQuery } = require('../../shared/db');

const DAY_MS = 24 * 60 * 60 * 1000;
const PAID = new Set(['completed', 'approved', 'payment_detected', 'delivering']);

function aggregate(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, total]) => ({ id, total }));
}

function safeDate(value) {
  const v = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

// Toshkent kuni (YYYY-MM-DD)
function tashkentDay(value) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

// Sana oralig'i: berilmasa oxirgi 30 kun (Toshkent kunlari). 366 kundan
// oshmaydi — kunlik seriya va buyurtma ro'yxati sig'ishi uchun.
function rangeBounds(params = {}) {
  const today = tashkentDay(Date.now());
  let to = safeDate(params.to) || today;
  let from = safeDate(params.from) || tashkentDay(Date.now() - 29 * DAY_MS);
  if (from > to) [from, to] = [to, from];
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (span > 366) from = tashkentDay(Date.parse(to) - 366 * DAY_MS);
  return { from, to, fromIso: `${from}T00:00:00+05:00`, toIso: `${to}T23:59:59.999+05:00` };
}

// Oraliqdagi buyurtmalar bo'yicha hisob (sof funksiya — testlanadi).
//   sales      — sotilgan tovar qiymati (base_price − chegirma), faqat xaridlar
//   cardIncome — kartaga kelgan pul (unique_price), xarid + to'ldirish
//   balancePaid— balansdan to'langan qism
// Voronka: yaratilgan → to'langan → yetkazilgan; muddati o'tgan / rad etilgan.
function summarizeOrders(orders, { from, to }) {
  const purchases = orders.filter((o) => String(o.order_type || 'purchase') !== 'topup');
  const topups = orders.filter((o) => String(o.order_type || '') === 'topup');
  const paidPurchases = purchases.filter((o) => PAID.has(o.status));
  const paidTopups = topups.filter((o) => PAID.has(o.status));
  const value = (o) => {
    const base = o.base_price != null ? Number(o.base_price) : Number(o.amount || 0);
    return Math.max(0, base - Number(o.discount_amount || 0));
  };
  const sales = paidPurchases.reduce((s, o) => s + value(o), 0);
  const cardIncome = [...paidPurchases, ...paidTopups].reduce((s, o) => s + Math.max(0, Number(o.unique_price || 0)), 0);
  const balancePaid = paidPurchases.reduce((s, o) => s + Number(o.balance_used || 0), 0);
  const buyers = new Map();
  for (const o of paidPurchases) buyers.set(String(o.user_telegram_id), (buyers.get(String(o.user_telegram_id)) || 0) + 1);
  const repeat = [...buyers.values()].filter((n) => n >= 2).length;

  // Kunlik seriya (Toshkent kuni bo'yicha)
  const byDay = new Map();
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY_MS) byDay.set(new Date(t).toISOString().slice(0, 10), { revenue: 0, paid: 0, created: 0 });
  for (const o of purchases) {
    const day = tashkentDay(o.created_at);
    const slot = byDay.get(day);
    if (!slot) continue;
    slot.created += 1;
    if (PAID.has(o.status)) {
      slot.paid += 1;
      slot.revenue += value(o);
    }
  }
  const dailyRevenue = [...byDay.entries()].map(([date, v]) => ({ date: `${date.slice(8, 10)}.${date.slice(5, 7)}`, iso: date, ...v }));

  const delivered = paidPurchases.filter((o) => o.status === 'completed' || o.delivery_status === 'delivered').length;
  return {
    sales,
    cardIncome,
    balancePaid,
    topupIncome: paidTopups.reduce((s, o) => s + Number(o.unique_price || o.amount || 0), 0),
    ordersCreated: purchases.length,
    ordersPaid: paidPurchases.length,
    ordersDelivered: delivered,
    ordersExpired: purchases.filter((o) => o.status === 'expired').length,
    ordersRejected: purchases.filter((o) => ['rejected', 'cancelled'].includes(o.status)).length,
    ordersWaiting: purchases.filter((o) => ['waiting_payment', 'pending_payment', 'payment_uploaded', 'checking'].includes(o.status)).length,
    topupsPaid: paidTopups.length,
    avgCheck: paidPurchases.length ? Math.round(sales / paidPurchases.length) : 0,
    uniqueBuyers: buyers.size,
    repeatBuyers: repeat,
    conversion: purchases.length ? Math.round((paidPurchases.length / purchases.length) * 100) : 0,
    dailyRevenue,
    topSoldIds: aggregate(paidPurchases, 'plan_id'),
  };
}
exports._summarizeOrders = summarizeOrders;
exports._rangeBounds = rangeBounds;

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false }) };
  }

  const supabase = getAdminClient();
  try {
    const range = rangeBounds(event.queryStringParameters || {});
    const rangeFilter = `created_at=gte.${encodeURIComponent(range.fromIso)}&created_at=lte.${encodeURIComponent(range.toIso)}`;

    const [
      totalUsers, usersWithoutPhone, newUsers, newUsersWithPhone,
      totalClicks, totalPaymentOpens, categoryRows, planRows, paymentRows, eventLogs, categories, plans,
      ordersResp, inventoryResp, referralsResp,
      waitingPaymentCount, paymentUploadedCount, manualRequiredCount, waitingStockCount,
    ] = await Promise.all([
      // Raqam berganlar — haqiqiy foydalanuvchilar; raqamsizlar alohida sanaladi
      countRows(supabase, 'users', 'phone=not.is.null'),
      countRows(supabase, 'users', 'phone=is.null'),
      countRows(supabase, 'users', rangeFilter),
      countRows(supabase, 'users', `${rangeFilter}&phone=not.is.null`),
      countRows(supabase, 'analytics_events'),
      countRows(supabase, 'analytics_events', 'event_type=eq.payment_opened'),
      listEventsByType(supabase, 'category_opened', 'category_id'),
      listEventsByType(supabase, 'plan_opened', 'plan_id'),
      listEventsByType(supabase, 'payment_opened', 'plan_id'),
      listRecentEvents(supabase, 20),
      listTable(supabase, 'categories'),
      listTable(supabase, 'plans'),
      // Ilgari faqat oxirgi 500 ta buyurtma olinardi — oylik raqam kesilib
      // qolardi. Endi tanlangan oraliqdagi hammasi (10 000 tagacha).
      request(supabase, 'orders', {
        query: toQuery({
          select: 'id,amount,base_price,unique_price,discount_amount,balance_used,status,delivery_status,plan_id,user_telegram_id,order_type,created_at',
          and: `(created_at.gte.${range.fromIso},created_at.lte.${range.toIso})`,
          order: 'created_at.desc',
          limit: 10000,
        }),
      }),
      request(supabase, 'inventory_items', { query: toQuery({ select: 'plan_id,status', limit: 5000 }) }),
      request(supabase, 'referrals', { query: 'select=total_earned' }).catch(() => ({ data: [] })),
      countRows(supabase, 'orders', 'status=in.(waiting_payment,pending_payment)'),
      countRows(supabase, 'orders', 'status=in.(payment_uploaded,checking)'),
      countRows(supabase, 'orders', 'status=eq.approved&delivery_status=eq.manual_required'),
      countRows(supabase, 'orders', 'delivery_status=eq.waiting_stock&status=not.in.(completed,rejected,cancelled,expired)'),
    ]);
    const orders = ordersResp.data || [];
    const inventory = inventoryResp.data || [];
    const referrals = referralsResp.data || [];
    const resolveName = (items, entry) => ({ ...entry, name: items.find((item) => item.id === entry.id)?.name || entry.id });

    const summary = summarizeOrders(orders, range);
    const availableByPlan = inventory.reduce((acc, row) => {
      if (!acc[row.plan_id]) acc[row.plan_id] = 0;
      if (row.status === 'available') acc[row.plan_id] += 1;
      return acc;
    }, {});
    const lowStockPlans = Object.entries(availableByPlan).filter(([, c]) => c <= 3).map(([id, total]) => ({ id, total, name: plans.find((p) => p.id === id)?.name || id }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        stats: {
          range: { from: range.from, to: range.to },
          totalUsers,
          usersWithoutPhone,
          newUsers,
          newUsersWithPhone,
          totalClicks,
          totalPaymentOpens,
          totalReferrals: referrals.length,
          referralBonusTotal: referrals.reduce((s, r) => s + Number(r.total_earned || 0), 0),
          mostViewedCategories: aggregate(categoryRows, 'category_id').map((item) => resolveName(categories, item)),
          mostViewedPlans: aggregate(planRows, 'plan_id').map((item) => resolveName(plans, item)),
          mostPaymentClicks: aggregate(paymentRows, 'plan_id').map((item) => resolveName(plans, item)),
          topSoldPlans: summary.topSoldIds.map((item) => resolveName(plans, item)),
          lowStockPlans,
          // Oraliq bo'yicha
          sales: summary.sales,
          cardIncome: summary.cardIncome,
          balancePaid: summary.balancePaid,
          topupIncome: summary.topupIncome,
          avgCheck: summary.avgCheck,
          uniqueBuyers: summary.uniqueBuyers,
          repeatBuyers: summary.repeatBuyers,
          conversion: summary.conversion,
          funnel: {
            new_users: newUsers,
            new_users_phone: newUsersWithPhone,
            orders_created: summary.ordersCreated,
            orders_paid: summary.ordersPaid,
            orders_delivered: summary.ordersDelivered,
            orders_expired: summary.ordersExpired,
            orders_rejected: summary.ordersRejected,
            orders_waiting: summary.ordersWaiting,
            topups_paid: summary.topupsPaid,
          },
          dailyRevenue: summary.dailyRevenue,
          // Global (oraliqqa bog'liq emas) — hozir nima kutib turibdi
          waitingPaymentCount,
          paymentUploadedCount,
          manualRequiredCount,
          waitingStockCount,
          eventLogs,
        },
      }),
    };
  } catch (error) {
    console.error('admin-dashboard error', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'Server xatosi' }) };
  }
};
