const { assertEnv, getEnv } = require('./config');

function getAdminClient() {
  assertEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  return {
    url: getEnv('SUPABASE_URL').replace(/\/$/, ''),
    key: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

async function request(client, table, { method = 'GET', query = '', body, headers = {} } = {}) {
  const url = `${client.url}/rest/v1/${table}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: client.key,
      Authorization: `Bearer ${client.key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed: ${response.status}`);
  }

  const contentRange = response.headers.get('content-range');
  const text = await response.text();
  return {
    data: text ? JSON.parse(text) : null,
    count: contentRange ? Number(contentRange.split('/').pop()) : null,
  };
}

async function rpcRequest(client, fnName, body = {}) {
  const url = `${client.url}/rest/v1/rpc/${fnName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: client.key,
      Authorization: `Bearer ${client.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function toQuery(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function mapCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    buttonLabel: row.button_label || row.name,
    description: row.description || '',
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

function mapPlan(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentPlanId: row.parent_plan_id,
    name: row.name,
    buttonLabel: row.button_label || row.name,
    price: row.price,
    currency: row.currency,
    duration: row.duration,
    warrantyText: row.warranty_text,
    description: row.description,
    howItWorksText: row.how_it_works_text,
    paymentInstructions: row.payment_instructions,
    delivery_type: row.delivery_type,
    deliveryType: row.delivery_type,
    deliveryInstructions: row.delivery_instructions,
    rulesText: row.rules_text || '',
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

async function fetchSettings(client) {
  const { data } = await request(client, 'settings', { query: 'select=*&id=eq.1' });
  return data?.[0] || null;
}

async function fetchCategories(client) {
  const { data } = await request(client, 'categories', {
    query: 'select=*&is_active=eq.true&order=sort_order.asc,created_at.asc',
  });
  return (data || []).map(mapCategory);
}

async function fetchPlansByCategory(client, categoryId, parentPlanId = null) {
  const parentQuery = parentPlanId ? `parent_plan_id=eq.${parentPlanId}` : 'parent_plan_id=is.null';
  const { data } = await request(client, 'plans', {
    query: `select=*&category_id=eq.${categoryId}&is_active=eq.true&${parentQuery}&order=sort_order.asc,created_at.asc`,
  });
  return (data || []).map(mapPlan);
}

async function fetchPlan(client, planId) {
  const { data } = await request(client, 'plans', { query: toQuery({ select: '*', id: `eq.${planId}` }) });
  return data?.[0] ? mapPlan(data[0]) : null;
}

async function fetchCategory(client, categoryId) {
  const { data } = await request(client, 'categories', { query: toQuery({ select: '*', id: `eq.${categoryId}` }) });
  return data?.[0] ? mapCategory(data[0]) : null;
}

async function upsertUser(client, telegramUser) {
  return request(client, 'users', {
    method: 'POST',
    query: 'on_conflict=telegram_id',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: {
      telegram_id: String(telegramUser.id),
      username: telegramUser.username || null,
      full_name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').trim(),
      language_code: telegramUser.language_code || 'uz',
      updated_at: new Date().toISOString(),
    },
  });
}

async function saveUserState(client, telegramId, state) {
  return request(client, 'user_states', {
    method: 'POST',
    query: 'on_conflict=telegram_id',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: {
      telegram_id: String(telegramId),
      state,
      updated_at: new Date().toISOString(),
    },
  });
}

async function fetchUserState(client, telegramId) {
  const { data } = await request(client, 'user_states', { query: toQuery({ select: 'state', telegram_id: `eq.${telegramId}` }) });
  return data?.[0]?.state || {};
}

async function trackEvent(client, event) {
  return request(client, 'analytics_events', {
    method: 'POST',
    body: {
      event_type: event.eventType,
      telegram_id: event.telegramId ? String(event.telegramId) : null,
      category_id: event.categoryId || null,
      plan_id: event.planId || null,
      metadata: event.metadata || {},
    },
  });
}

async function insertReceiptSubmission(client, item) {
  const { data } = await request(client, 'receipt_submissions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: item,
  });
  return data?.[0] || null;
}

async function listTable(client, table) {
  const { data } = await request(client, table, { query: 'select=*&order=sort_order.asc.nullslast,created_at.asc.nullslast' });
  return data || [];
}

async function insertRow(client, table, item) {
  const { data } = await request(client, table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: item });
  return data?.[0] || null;
}

async function updateRow(client, table, id, item) {
  const { data } = await request(client, table, {
    method: 'PATCH',
    query: `id=eq.${id}`,
    headers: { Prefer: 'return=representation' },
    body: item,
  });
  return data?.[0] || null;
}

async function deleteRow(client, table, id) {
  return request(client, table, { method: 'DELETE', query: `id=eq.${id}` });
}

async function countRows(client, table, filter = '') {
  const { count } = await request(client, table, {
    method: 'GET',
    query: `select=id${filter ? `&${filter}` : ''}`,
    headers: { Prefer: 'count=exact' },
  });
  return count || 0;
}

async function listRecentEvents(client, limit = 20) {
  const { data } = await request(client, 'analytics_events', { query: toQuery({ select: '*', order: 'created_at.desc', limit }) });
  return data || [];
}

async function listEventsByType(client, eventType, key) {
  const { data } = await request(client, 'analytics_events', { query: toQuery({ select: key, event_type: `eq.${eventType}` }) });
  return data || [];
}

function generateOrderNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${stamp}-${rand}`;
}

async function createOrder(client, order) {
  const payload = {
    order_number: order.order_number || generateOrderNumber(),
    user_id: order.user_id || null,
    user_telegram_id: String(order.user_telegram_id),
    plan_id: order.plan_id || null,
    amount: Number(order.amount || 0),
    status: order.status || 'pending_payment',
    payment_method: order.payment_method || null,
    delivery_status: order.delivery_status || 'waiting_approval',
    inventory_item_id: order.inventory_item_id || null,
    admin_comment: order.admin_comment || null,
  };
  const { data } = await request(client, 'orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: payload,
  });
  return data?.[0] || null;
}

async function getOrderById(client, orderId) {
  const { data } = await request(client, 'orders', {
    query: toQuery({ select: '*', id: `eq.${orderId}`, limit: 1 }),
  });
  return data?.[0] || null;
}

async function getOrderByNumber(client, orderNumber) {
  const { data } = await request(client, 'orders', {
    query: toQuery({ select: '*', order_number: `eq.${orderNumber}`, limit: 1 }),
  });
  return data?.[0] || null;
}

async function getLatestPendingOrderForUser(client, telegramId) {
  const { data } = await request(client, 'orders', {
    query: toQuery({
      select: '*',
      user_telegram_id: `eq.${telegramId}`,
      status: 'in.(pending_payment,payment_uploaded,checking)',
      order: 'created_at.desc',
      limit: 1,
    }),
  });
  return data?.[0] || null;
}

async function attachReceiptToOrder(client, orderId, receipt) {
  const patch = {
    receipt_submission_id: receipt.receipt_submission_id || null,
    receipt_file_id: receipt.receipt_file_id || null,
    receipt_file_type: receipt.receipt_file_type || null,
    status: receipt.status || 'payment_uploaded',
    receipt_uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data } = await request(client, 'orders', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${orderId}` }),
    headers: { Prefer: 'return=representation' },
    body: patch,
  });
  return data?.[0] || null;
}

async function updateOrderStatus(client, orderId, status, extra = {}) {
  const now = new Date().toISOString();
  const patch = { status, updated_at: now, ...extra };
  if (status === 'approved') patch.approved_at = extra.approved_at || now;
  if (status === 'rejected') patch.rejected_at = extra.rejected_at || now;
  if (status === 'completed') patch.completed_at = extra.completed_at || now;
  const { data } = await request(client, 'orders', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${orderId}` }),
    headers: { Prefer: 'return=representation' },
    body: patch,
  });
  return data?.[0] || null;
}

function isAdminTelegramId(telegramId) {
  const id = String(telegramId || '').trim();
  if (!id) return false;
  const admins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (process.env.ADMIN_CHAT_ID) admins.push(String(process.env.ADMIN_CHAT_ID).trim());
  return new Set(admins).has(id);
}

async function approveOrder(client, orderId) {
  const current = await getOrderById(client, orderId);
  if (!current) return { ok: false, reason: 'not_found' };
  if (['approved', 'rejected', 'completed', 'cancelled'].includes(current.status)) return { ok: false, reason: 'already_processed', order: current };
  if (!['payment_uploaded', 'checking'].includes(current.status)) return { ok: false, reason: 'invalid_status', order: current };

  const now = new Date().toISOString();
  const { data } = await request(client, 'orders', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${orderId}`, status: `in.(payment_uploaded,checking)` }),
    headers: { Prefer: 'return=representation' },
    body: { status: 'approved', approved_at: now, updated_at: now },
  });
  if (!data?.[0]) {
    const latest = await getOrderById(client, orderId);
    return { ok: false, reason: 'already_processed', order: latest };
  }
  return { ok: true, order: data[0] };
}

async function rejectOrder(client, orderId) {
  const current = await getOrderById(client, orderId);
  if (!current) return { ok: false, reason: 'not_found' };
  if (['approved', 'rejected', 'completed', 'cancelled'].includes(current.status)) return { ok: false, reason: 'already_processed', order: current };

  const now = new Date().toISOString();
  const { data } = await request(client, 'orders', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${orderId}`, status: `not.in.(approved,rejected,completed,cancelled)` }),
    headers: { Prefer: 'return=representation' },
    body: { status: 'rejected', rejected_at: now, delivery_status: 'failed', updated_at: now },
  });
  if (!data?.[0]) {
    const latest = await getOrderById(client, orderId);
    return { ok: false, reason: 'already_processed', order: latest };
  }
  return { ok: true, order: data[0] };
}

async function listOrdersByStatus(client, status, limit = 50) {
  const { data } = await request(client, 'orders', {
    query: toQuery({ select: '*', status: `eq.${status}`, order: 'created_at.desc', limit }),
  });
  return data || [];
}

async function getOrdersByUser(client, telegramId, limit = 20) {
  const { data } = await request(client, 'orders', {
    query: toQuery({ select: '*', user_telegram_id: `eq.${telegramId}`, order: 'created_at.desc', limit }),
  });
  return data || [];
}

async function createInventoryItem(client, item) {
  const { data } = await request(client, 'inventory_items', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: item,
  });
  return data?.[0] || null;
}

function maskInventory(row = {}) {
  return {
    ...row,
    login: row.login ? `${String(row.login).slice(0, 2)}***` : null,
    password_encrypted: row.password_encrypted ? '***' : null,
    license_key_encrypted: row.license_key_encrypted ? '***' : null,
    extra_data_encrypted: row.extra_data_encrypted ? '***' : null,
  };
}

async function listInventoryByPlan(client, planId) {
  const { data } = await request(client, 'inventory_items', {
    query: toQuery({ select: '*', plan_id: `eq.${planId}`, order: 'created_at.asc' }),
  });
  return (data || []).map(maskInventory);
}

async function getInventoryCountsByPlan(client, planId) {
  const { data } = await request(client, 'inventory_items', {
    query: toQuery({ select: 'status', plan_id: `eq.${planId}` }),
  });
  return (data || []).reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
}

async function claimInventoryItemForOrder(client, planId, orderId, userTelegramId, type = null) {
  if (type) {
    try {
      const rows = await rpcRequest(client, 'claim_inventory_item_by_type', {
        p_plan_id: planId,
        p_order_id: orderId,
        p_user_telegram_id: String(userTelegramId),
        p_type: type,
      });
      return rows?.[0] || null;
    } catch (error) {
      console.warn('claim_inventory_item_by_type unavailable, falling back to legacy claim_inventory_item:', error?.message);
    }
  }

  const rows = await rpcRequest(client, 'claim_inventory_item', {
    p_plan_id: planId,
    p_order_id: orderId,
    p_user_telegram_id: String(userTelegramId),
  });
  return rows?.[0] || null;
}

async function markInventoryDelivered(client, inventoryItemId, status = 'delivered') {
  const now = new Date().toISOString();
  const { data } = await request(client, 'inventory_items', {
    method: 'PATCH',
    query: toQuery({ id: `eq.${inventoryItemId}` }),
    headers: { Prefer: 'return=representation' },
    body: { status, delivered_at: now, sold_at: status === 'sold' ? now : null },
  });
  return data?.[0] || null;
}

async function createDeliveryLog(client, item) {
  const { data } = await request(client, 'delivery_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: item,
  });
  return data?.[0] || null;
}

async function getWaitingStockOrders(client, limit = 50) {
  const { data } = await request(client, 'orders', {
    query: toQuery({ select: '*', status: 'eq.approved', delivery_status: 'eq.waiting_stock', order: 'created_at.asc', limit }),
  });
  return data || [];
}

async function retryDeliveryForOrder(client, orderId) {
  return getOrderById(client, orderId);
}

async function setUserAwaitingReceipt(client, telegramId, patchState = {}) {
  const current = await fetchUserState(client, telegramId);
  const next = {
    ...current,
    awaiting_receipt: true,
    ...patchState,
  };
  await saveUserState(client, telegramId, next);
  return next;
}

async function clearUserAwaitingReceipt(client, telegramId) {
  const current = await fetchUserState(client, telegramId);
  const next = {
    ...current,
    awaiting_receipt: false,
    current_order_id: null,
  };
  await saveUserState(client, telegramId, next);
  return next;
}

// ✅ TUZATILDI: Bu funksiya avval yo'q edi, shuning uchun bot ishlamay qolardi
async function createSubscriptionFromOrder(client, order, plan) {
  try {
    if (!order || !plan) return null;
    const now = new Date();
    const durationDays = plan.duration ? parseDurationToDays(plan.duration) : 30;
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await request(client, 'subscriptions', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates', 'on_conflict': 'order_id' },
      body: {
        order_id: order.id,
        user_telegram_id: String(order.user_telegram_id),
        plan_id: order.plan_id || null,
        plan_name: plan.name || null,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt,
        created_at: now.toISOString(),
      },
    });
    return data?.[0] || null;
  } catch (error) {
    // Subscriptions jadvali bo'lmasa ham bot ishlaveradi
    console.warn('createSubscriptionFromOrder warning (ignored):', error?.message);
    return null;
  }
}

function parseDurationToDays(duration = '') {
  const str = String(duration).toLowerCase();
  const num = parseInt(str, 10) || 30;
  if (str.includes('yil') || str.includes('year')) return num * 365;
  if (str.includes('oy') || str.includes('month')) return num * 30;
  if (str.includes('hafta') || str.includes('week')) return num * 7;
  if (str.includes('kun') || str.includes('day')) return num;
  return 30;
}

module.exports = {
  getAdminClient,
  request,
  fetchSettings,
  fetchCategories,
  fetchPlansByCategory,
  fetchPlan,
  fetchCategory,
  upsertUser,
  saveUserState,
  fetchUserState,
  trackEvent,
  insertReceiptSubmission,
  listTable,
  insertRow,
  updateRow,
  deleteRow,
  countRows,
  listRecentEvents,
  listEventsByType,
  mapCategory,
  mapPlan,
  toQuery,
  createOrder,
  getOrderById,
  getOrderByNumber,
  getLatestPendingOrderForUser,
  attachReceiptToOrder,
  updateOrderStatus,
  listOrdersByStatus,
  getOrdersByUser,
  setUserAwaitingReceipt,
  clearUserAwaitingReceipt,
  approveOrder,
  rejectOrder,
  isAdminTelegramId,
  createInventoryItem,
  listInventoryByPlan,
  getInventoryCountsByPlan,
  claimInventoryItemForOrder,
  markInventoryDelivered,
  createDeliveryLog,
  getWaitingStockOrders,
  retryDeliveryForOrder,
  createSubscriptionFromOrder,
};
