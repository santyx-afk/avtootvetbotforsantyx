const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient, countRows, listRecentEvents, listEventsByType, listTable, request, fetchAllRows, toQuery, PAID_ORDER_STATUSES: PAID, orderSaleValue: value, isPaidPurchase } = require('../../shared/db');

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Sof foyda (sof funksiya — testlanadi). Har bir to'langan xarid uchun:
//   tannarx = buyurtma elementlari (order_items) bo'yicha reja tannarxlari
//             yig'indisi; elementlar bo'lmasa — orders.plan_id × 1
//   foyda   = sotuv qiymati (base_price − chegirma) − tannarx
// Savatdagi bir nechta tovarli buyurtmada sotuv qiymati elementlarga
// unit_price ulushiga qarab bo'linadi (rejalar kesimi uchun).
// Tannarxi kiritilmagan reja sotilgan bo'lsa, u 0 deb olinadi va
// `missingCostSales` da sanaladi — foyda oshirib ko'rsatilganini bildiradi.
function summarizeProfit(orders, items, plans) {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const itemsByOrder = new Map();
  for (const it of items) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id).push(it);
  }
  const costOf = (planId) => {
    const raw = planById.get(planId)?.cost_price;
    return raw == null || raw === '' ? null : Number(raw);
  };

  let cost = 0;
  let sales = 0;
  let missingCostSales = 0;
  const byPlan = new Map();
  const byDay = new Map();
  for (const o of orders.filter(isPaidPurchase)) {
    const orderValue = value(o);
    const lines = itemsByOrder.get(o.id)?.length
      ? itemsByOrder.get(o.id).map((it) => ({ planId: it.plan_id, qty: Number(it.quantity || 1), unit: Number(it.unit_price || 0) }))
      : [{ planId: o.plan_id, qty: 1, unit: orderValue }];
    const unitTotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
    let orderCost = 0;
    for (const l of lines) {
      const share = unitTotal > 0 ? (l.unit * l.qty) / unitTotal : 1 / lines.length;
      const lineRevenue = orderValue * share;
      const unitCost = costOf(l.planId);
      if (unitCost == null) missingCostSales += l.qty;
      const lineCost = (unitCost || 0) * l.qty;
      orderCost += lineCost;
      const row = byPlan.get(l.planId) || { id: l.planId, sold: 0, revenue: 0, cost: 0, hasCost: unitCost != null };
      row.sold += l.qty;
      row.revenue += lineRevenue;
      row.cost += lineCost;
      byPlan.set(l.planId, row);
    }
    cost += orderCost;
    sales += orderValue;
    const day = tashkentDay(o.created_at);
    byDay.set(day, (byDay.get(day) || 0) + orderValue - orderCost);
  }
  const profit = sales - cost;
  const plansProfit = [...byPlan.values()]
    .map((r) => ({
      ...r,
      name: planById.get(r.id)?.name || 'O‘chirilgan reja',
      revenue: Math.round(r.revenue),
      cost: Math.round(r.cost),
      profit: Math.round(r.revenue - r.cost),
    }))
    .sort((a, b) => b.profit - a.profit);
  return {
    cost: Math.round(cost),
    profit: Math.round(profit),
    margin: sales > 0 ? Math.round((profit / sales) * 100) : 0,
    missingCostSales,
    plansProfit,
    dailyProfit: Object.fromEntries([...byDay.entries()].map(([d, v]) => [d, Math.round(v)])),
  };
}
exports._summarizeProfit = summarizeProfit;
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
      // Tanlangan oraliqdagi HAMMA buyurtma. Ilgari `limit: 10000` edi, lekin
      // Supabase (PostgREST max-rows) baribir 1000 tadan ko'p qaytarmaydi —
      // band oylarda tushum kam ko'rsatilardi. Endi sahifalab olinadi.
      fetchAllRows(supabase, 'orders', toQuery({
        select: 'id,amount,base_price,unique_price,discount_amount,balance_used,status,delivery_status,plan_id,user_telegram_id,order_type,created_at',
        and: `(created_at.gte.${range.fromIso},created_at.lte.${range.toIso})`,
        order: 'created_at.asc,id.asc',
      })),
      // Zaxira ham 1000 bilan kesilardi — "kam qoldi" ogohlantirishi noto'g'ri edi
      fetchAllRows(supabase, 'inventory_items', 'select=plan_id,status&order=id.asc'),
      request(supabase, 'referrals', { query: 'select=total_earned' }).catch(() => ({ data: [] })),
      countRows(supabase, 'orders', 'status=in.(waiting_payment,pending_payment)'),
      countRows(supabase, 'orders', 'status=in.(payment_uploaded,checking)'),
      countRows(supabase, 'orders', 'status=eq.approved&delivery_status=eq.manual_required'),
      countRows(supabase, 'orders', 'delivery_status=eq.waiting_stock&status=not.in.(completed,rejected,cancelled,expired)'),
    ]);
    const orders = ordersResp;
    const inventory = inventoryResp;
    const referrals = referralsResp.data || [];
    const resolveName = (items, entry) => ({ ...entry, name: items.find((item) => item.id === entry.id)?.name || entry.id });

    const summary = summarizeOrders(orders, range);

    // Sof foyda — faqat egasi uchun (operator marjani ko'rmaydi). Buyurtma
    // elementlari buyurtma bilan bir vaqtda yoziladi, shuning uchun shu
    // oraliq (+10 daqiqa zaxira) bo'yicha olinadi.
    let profit = null;
    if (requireOwner(event.headers)) {
      const itemsTo = new Date(Date.parse(range.toIso) + 10 * 60 * 1000).toISOString();
      const items = await fetchAllRows(supabase, 'order_items', toQuery({
        select: 'order_id,plan_id,quantity,unit_price',
        and: `(created_at.gte.${range.fromIso},created_at.lte.${itemsTo})`,
        order: 'created_at.asc,id.asc',
      })).catch((e) => { console.warn('order_items warn:', e?.message); return []; });
      profit = summarizeProfit(orders, items, plans);
      for (const d of summary.dailyRevenue) d.profit = profit.dailyProfit[d.iso] || 0;
      delete profit.dailyProfit;
    }
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
          profit,
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
