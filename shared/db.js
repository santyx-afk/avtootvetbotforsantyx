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
    oldPrice: row.old_price != null ? Number(row.old_price) : null,
    old_price: row.old_price != null ? Number(row.old_price) : null,
    imageUrl: row.image_url || null,
    image_url: row.image_url || null,
    isPopular: Boolean(row.is_popular),
    is_popular: Boolean(row.is_popular),
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
  return String(Math.floor(10000 + Math.random() * 90000));
}

async function createOrder(client, order) {
  const payload = {
    order_number: order.order_number || generateOrderNumber(),
    user_id: order.user_id || null,
    user_telegram_id: String(order.user_telegram_id),
    plan_id: order.plan_id || null,
    order_type: order.order_type || 'purchase',
    amount: Number(order.amount || 0),
    base_price: order.base_price === undefined ? Number(order.amount || 0) : Number(order.base_price || 0),
    unique_price: order.unique_price === undefined ? null : Number(order.unique_price || 0),
    expires_at: order.expires_at || null,
    payment_source: order.payment_source || null,
    status: order.status || 'waiting_payment',
    payment_method: order.payment_method || null,
    delivery_status: order.delivery_status || 'waiting_approval',
    inventory_item_id: order.inventory_item_id || null,
    admin_comment: order.admin_comment || null,
    delivery_attempts: order.delivery_attempts || 0,
    promo_code: order.promo_code || null,
    discount_amount: Number(order.discount_amount || 0),
    balance_used: Number(order.balance_used || 0),
  };
  // topup_credit faqat berilganda qo'shiladi — shunda ustun hali yo'q DB'da
  // (migratsiya qo'llanmagan) oddiy xaridlar buzilmaydi.
  if (order.topup_credit !== undefined && order.topup_credit !== null) {
    payload.topup_credit = Number(order.topup_credit);
  }
  // cashback_amount ham shunga o'xshash — faqat berilganda (ustun mavjud bo'lsa)
  if (order.cashback_amount !== undefined && order.cashback_amount !== null && Number(order.cashback_amount) > 0) {
    payload.cashback_amount = Number(order.cashback_amount);
  }
  const { data } = await request(client, 'orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: payload,
  });
  return data?.[0] || null;
}


function calculatePromoDiscount(basePrice, promo = {}) {
  if (!promo) return 0;
  const value = Number(promo.discount_value || 0);
  if (promo.discount_type === 'percent') return Math.min(Number(basePrice || 0), Math.floor(Number(basePrice || 0) * value / 100));
  if (promo.discount_type === 'fixed') return Math.min(Number(basePrice || 0), value);
  return 0; // cashback_percent yoki noma'lum — darhol chegirma yo'q
}

// Cashback promokod: to'lov to'liq narxda, keyin shu summa balansga qaytadi.
function calculatePromoCashback(basePrice, promo = {}) {
  if (!promo || promo.discount_type !== 'cashback_percent') return 0;
  return Math.floor((Number(basePrice || 0) * Number(promo.discount_value || 0)) / 100);
}


async function createExceptionQueueItem(client, item) {
  const { data } = await request(client, 'exception_queue', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { order_id: item.order_id, reason: item.reason, status: item.status || 'open', metadata: item.metadata || {} } });
  return data?.[0] || null;
}

async function createAuditLog(client, item) {
  try {
    const { data } = await request(client, 'audit_logs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { order_id: item.order_id || null, user_telegram_id: item.user_telegram_id ? String(item.user_telegram_id) : null, action: item.action, status: item.status || null, metadata: item.metadata || {} } });
    return data?.[0] || null;
  } catch (error) {
    console.warn('audit log warning:', error?.message);
    return null;
  }
}

async function getInventoryItemById(client, inventoryItemId) {
  const { data } = await request(client, 'inventory_items', { query: toQuery({ select: '*', id: `eq.${inventoryItemId}`, limit: 1 }) });
  return data?.[0] || null;
}

async function updateOrderItem(client, orderItemId, patch) {
  const { data } = await request(client, 'order_items', { method: 'PATCH', query: toQuery({ id: `eq.${orderItemId}` }), headers: { Prefer: 'return=representation' }, body: { ...patch, updated_at: new Date().toISOString() } });
  return data?.[0] || null;
}

// Reserved inventory tizimi olib tashlandi: checkout endi inventarni band QILMAYDI.
// Stock faqat to'lov tasdiqlangach (yetkazish paytida, claimInventoryItemForOrder)
// tekshiriladi. Shu sabab reserveInventoryForOrder / releaseInventoryForOrder yo'q.
// expireOrder faqat unique_price'ni qayta ishlatish uchun qoladi (HumoCardBot aniqlash).

async function expireOrder(client, order) {
  const now = new Date().toISOString();
  const { data } = await request(client, 'orders', { method: 'PATCH', query: toQuery({ id: `eq.${order.id}`, status: 'in.(waiting_payment,pending_payment)' }), headers: { Prefer: 'return=representation' }, body: { status: 'expired', delivery_status: 'failed', updated_at: now, admin_comment: 'Payment timeout' } });
  const expired = data?.[0] || null;
  await createAuditLog(client, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'order_expired', status: 'expired', metadata: { expiresAt: order.expires_at } });
  return expired;
}

async function getPromoCode(client, code) {
  if (!code) return null;
  const { data } = await request(client, 'promo_codes', { query: toQuery({ select: '*', code: `eq.${String(code).trim().toUpperCase()}`, is_active: 'eq.true', limit: 1 }) });
  return data?.[0] || null;
}

async function validatePromoCode(client, code, basePrice) {
  const promo = await getPromoCode(client, code);
  if (!promo) return { ok: false, reason: 'not_found' };
  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired', promo };
  if (promo.max_uses && Number(promo.used_count || 0) >= Number(promo.max_uses)) return { ok: false, reason: 'usage_limit', promo };
  if (promo.min_order_amount && Number(basePrice || 0) < Number(promo.min_order_amount)) return { ok: false, reason: 'min_order', promo };
  const discount = calculatePromoDiscount(basePrice, promo);
  const cashback = calculatePromoCashback(basePrice, promo);
  return { ok: true, promo, discount, cashback };
}

async function getUserBalance(client, telegramId) {
  const { data } = await request(client, 'user_wallets', { query: toQuery({ select: '*', user_telegram_id: `eq.${telegramId}`, limit: 1 }) });
  return data?.[0] || { user_telegram_id: String(telegramId), balance: 0 };
}

async function adjustWalletBalance(client, telegramId, delta) {
  try {
    const rows = await rpcRequest(client, 'credit_user_wallet', { p_user_telegram_id: String(telegramId), p_amount: Number(delta) });
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  } catch (error) {
    console.warn('credit_user_wallet RPC unavailable, using REST fallback:', error?.message);
    const wallet = await getUserBalance(client, telegramId);
    const { data } = await request(client, 'user_wallets', {
      method: 'POST',
      query: 'on_conflict=user_telegram_id',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: { user_telegram_id: String(telegramId), balance: Number(wallet.balance || 0) + Number(delta), updated_at: new Date().toISOString() },
    });
    return data?.[0] || null;
  }
}

// Tranzaksiya yozuvi user_wallets.balance ni o'zi yangilamaydi, shuning uchun ikkalasi shu yerda birga bajariladi
async function addWalletTransaction(client, item) {
  const amount = Math.abs(Number(item.amount || 0));
  const body = { user_telegram_id: String(item.user_telegram_id), order_id: item.order_id || null, amount, type: item.type, description: item.description || null };
  if (item.admin_id) body.admin_id = String(item.admin_id);
  const { data } = await request(client, 'wallet_transactions', { method: 'POST', headers: { Prefer: 'return=representation' }, body });
  // debit va admin_debit balansni kamaytiradi; qolganlari oshiradi
  const negative = item.type === 'debit' || item.type === 'admin_debit';
  const wallet = await adjustWalletBalance(client, item.user_telegram_id, negative ? -amount : amount);
  return { ...(data?.[0] || {}), wallet };
}

async function createCartItem(client, item) {
  const { data } = await request(client, 'cart_items', {
    method: 'POST',
    query: 'on_conflict=user_telegram_id,plan_id',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: { user_telegram_id: String(item.user_telegram_id), plan_id: item.plan_id, quantity: Math.max(1, Number(item.quantity || 1)), updated_at: new Date().toISOString() },
  });
  return data?.[0] || null;
}

async function listCartItems(client, telegramId) {
  const { data } = await request(client, 'cart_items', { query: toQuery({ select: '*,plans(*)', user_telegram_id: `eq.${telegramId}`, order: 'created_at.asc' }) });
  return (data || []).map((row) => ({ ...row, plan: row.plans ? mapPlan(row.plans) : null }));
}

async function updateCartItemQuantity(client, id, quantity) {
  const { data } = await request(client, 'cart_items', { method: 'PATCH', query: toQuery({ id: `eq.${id}` }), headers: { Prefer: 'return=representation' }, body: { quantity: Math.max(1, Number(quantity || 1)), updated_at: new Date().toISOString() } });
  return data?.[0] || null;
}

async function removeCartItem(client, id) { return request(client, 'cart_items', { method: 'DELETE', query: toQuery({ id: `eq.${id}` }) }); }
async function clearCart(client, telegramId) { return request(client, 'cart_items', { method: 'DELETE', query: toQuery({ user_telegram_id: `eq.${telegramId}` }) }); }

async function generateUniquePrice(client, basePrice) {
  const base = Math.floor(Number(basePrice || 0));
  const { data } = await request(client, 'orders', { query: 'select=unique_price&status=in.(waiting_payment,pending_payment)&unique_price=not.is.null' });
  // HumoCardBot to'lovni faqat summa bo'yicha topadi — shuning uchun vakansiya
  // modulida band qilingan summalar ham hisobga olinadi (aks holda bir xil summa
  // ikkala modulda ochiq bo'lib, to'lov noto'g'ri buyurtmaga biriktirilishi mumkin).
  // Jadval hali yaratilmagan bo'lsa (migratsiya qo'llanmagan) — do'kon ishlayveradi.
  const { data: vacancyData } = await request(client, 'freelance_orders', {
    query: 'select=unique_price&status=in.(payment_pending,final_payment_pending)&unique_price=not.is.null',
  }).catch(() => ({ data: [] }));
  const reserved = new Set([...(data || []), ...(vacancyData || [])].map((row) => Number(row.unique_price)));
  const start = Math.floor(Math.random() * 999) + 1;
  for (let i = 0; i < 999; i += 1) {
    const candidate = base + (((start + i - 1) % 999) + 1);
    if (!reserved.has(candidate)) return candidate;
  }
  throw new Error('No unique payment suffix available');
}

async function createCheckoutOrder(client, { user_telegram_id, items, expiresMinutes = Number(process.env.PAYMENT_EXPIRES_MINUTES || 30), promo = null, balanceUsed = 0, cashbackAmount = 0 }) {
  const basePrice = items.reduce((sum, item) => sum + Number(item.plan?.price || item.price || 0) * Number(item.quantity || 1), 0);
  const discount = promo ? calculatePromoDiscount(basePrice, promo) : 0;
  const payableBase = Math.max(0, basePrice - discount - Number(balanceUsed || 0));
  const uniquePrice = payableBase > 0 ? await generateUniquePrice(client, payableBase) : 0;
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
  const order = await createOrder(client, { user_telegram_id, plan_id: items[0]?.plan_id || items[0]?.plan?.id || null, amount: uniquePrice, base_price: basePrice, unique_price: uniquePrice, expires_at: expiresAt, status: uniquePrice > 0 ? 'waiting_payment' : 'payment_detected', delivery_status: 'waiting_approval', payment_method: 'humo_card_bot', payment_source: uniquePrice > 0 ? 'humo_card_bot' : 'balance', promo_code: promo?.code || null, discount_amount: discount, balance_used: Number(balanceUsed || 0), cashback_amount: Number(cashbackAmount || 0) });
  if (promo?.id) {
    await request(client, 'promo_codes', { method: 'PATCH', query: toQuery({ id: `eq.${promo.id}` }), body: { used_count: Number(promo.used_count || 0) + 1 } });
  }
  for (const item of items) {
    const unit = Number(item.plan?.price || item.price || 0);
    for (let i = 0; i < Number(item.quantity || 1); i += 1) {
      await request(client, 'order_items', { method: 'POST', body: { order_id: order.id, user_telegram_id: String(user_telegram_id), plan_id: item.plan_id || item.plan?.id, quantity: 1, unit_price: unit, total_price: unit, delivery_status: 'pending' } });
    }
  }
  return order;
}


// Promokod cashback summasini balansga qaytaradi (bir marta — audit_logs guard).
// To'lov tasdiqlangach (yetkazish/approve) chaqiriladi.
async function creditOrderCashback(client, order) {
  try {
    const amount = Number(order?.cashback_amount || 0);
    if (!(amount > 0)) return false;
    const prior = await request(client, 'audit_logs', {
      query: `select=id&order_id=eq.${order.id}&action=eq.promo_cashback&limit=1`,
    }).then((r) => r.data).catch(() => []);
    if (prior && prior[0]) return false;
    await addWalletTransaction(client, {
      user_telegram_id: order.user_telegram_id,
      order_id: order.id,
      amount,
      type: 'cashback',
      description: `Promokod cashback #${order.order_number}`,
    });
    await createAuditLog(client, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'promo_cashback', status: 'completed', metadata: { amount } });
    try {
      const { sendMessage } = require('./telegram');
      await sendMessage(order.user_telegram_id, `🎁 Sizga ${new Intl.NumberFormat('uz-UZ').format(amount)} UZS cashback tushdi!`, null);
    } catch {
      /* xabar ketmasa ham cashback berilgan */
    }
    return true;
  } catch (e) {
    console.warn('creditOrderCashback warn:', e?.message);
    return false;
  }
}

async function confirmPaymentNotification(client, { amount, source = 'humo_card_bot', messageKey, rawPayload = {} }) {
  try {
    const rows = await rpcRequest(client, 'confirm_payment_notification', {
      p_amount: Number(amount),
      p_source: source,
      p_message_key: String(messageKey),
      p_payload: rawPayload,
    });
    const result = rows?.[0] || rows || null;
    return result?.order_row ? { ...result, order: result.order_row } : result;
  } catch (error) {
    console.warn('confirm_payment_notification RPC unavailable, using REST fallback:', error?.message);
    const inserted = await insertProcessedPaymentMessage(client, { source, message_key: messageKey, amount, raw_payload: rawPayload });
    if (!inserted) return { status: 'duplicate', order: null };
    const order = await findWaitingOrderByUniquePrice(client, amount);
    if (!order) return { status: 'no_match', order: null };
    const paidOrder = await markOrderPaidFromPayment(client, order.id, { payment_source: source, payment_message_id: messageKey });
    return paidOrder ? { status: 'matched', order: paidOrder } : { status: 'duplicate', order: null };
  }
}

async function enqueueDeliveryRetry(client, { order_id, reason, metadata = {}, retry_count = 0, next_retry_at }) {
  const dueAt = next_retry_at || new Date(Date.now() + 5000).toISOString();
  const { data } = await request(client, 'delivery_retry_queue', {
    method: 'POST',
    query: 'on_conflict=order_id',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: { order_id, reason, metadata, status: 'pending', retry_count, next_retry_at: dueAt, updated_at: new Date().toISOString() },
  });
  return data?.[0] || null;
}

async function listDueDeliveryRetries(client, limit = 20) {
  const now = new Date().toISOString();
  const { data } = await request(client, 'delivery_retry_queue', { query: toQuery({ select: '*,orders(*)', status: 'eq.pending', next_retry_at: `lte.${now}`, order: 'next_retry_at.asc', limit }) });
  return data || [];
}

async function updateDeliveryRetry(client, id, patch) {
  const { data } = await request(client, 'delivery_retry_queue', { method: 'PATCH', query: toQuery({ id: `eq.${id}` }), headers: { Prefer: 'return=representation' }, body: { ...patch, updated_at: new Date().toISOString() } });
  return data?.[0] || null;
}

async function completeDeliveryRetry(client, id) {
  return updateDeliveryRetry(client, id, { status: 'completed', completed_at: new Date().toISOString() });
}

async function failDeliveryRetry(client, id, { reason, metadata = {} }) {
  return updateDeliveryRetry(client, id, { status: 'failed', reason, metadata });
}

async function listStuckDeliveringOrders(client, minutes = 2, limit = 20) {
  const cutoff = new Date(Date.now() - Number(minutes || 2) * 60 * 1000).toISOString();
  const { data } = await request(client, 'orders', { query: toQuery({ select: '*', status: 'eq.delivering', updated_at: `lt.${cutoff}`, order: 'updated_at.asc', limit }) });
  return data || [];
}

async function cleanupProcessedPaymentMessages(client, days = 14) {
  const cutoff = new Date(Date.now() - Number(days || 14) * 24 * 60 * 60 * 1000).toISOString();
  return request(client, 'processed_payment_messages', { method: 'DELETE', query: toQuery({ created_at: `lt.${cutoff}` }) });
}

async function updateMonitoringSnapshot(client) {
  try {
    const rows = await rpcRequest(client, 'refresh_monitoring_snapshot', {});
    return rows?.[0] || rows || null;
  } catch (error) {
    console.warn('refresh_monitoring_snapshot RPC unavailable:', error?.message);
    return null;
  }
}

async function findWaitingOrderByUniquePrice(client, amount) {
  const { data } = await request(client, 'orders', { query: toQuery({ select: '*', unique_price: `eq.${amount}`, status: 'in.(waiting_payment,pending_payment)', order: 'created_at.asc', limit: 1 }) });
  return data?.[0] || null;
}

async function markOrderPaidFromPayment(client, orderId, extra = {}) {
  const now = new Date().toISOString();
  const { data } = await request(client, 'orders', { method: 'PATCH', query: toQuery({ id: `eq.${orderId}`, status: 'in.(waiting_payment,pending_payment)' }), headers: { Prefer: 'return=representation' }, body: { status: 'payment_detected', paid_at: now, approved_at: now, payment_source: extra.payment_source || 'humo_card_bot', payment_message_id: extra.payment_message_id || null, updated_at: now } });
  return data?.[0] || null;
}

async function insertPaymentLog(client, item) { const { data } = await request(client, 'payment_logs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: item }); return data?.[0] || null; }
async function insertProcessedPaymentMessage(client, item) { const { data } = await request(client, 'processed_payment_messages', { method: 'POST', query: 'on_conflict=source,message_key', headers: { Prefer: 'return=representation,resolution=ignore-duplicates' }, body: item }); return data?.[0] || null; }
async function getOrderItems(client, orderId) { const { data } = await request(client, 'order_items', { query: toQuery({ select: '*,plans(*)', order_id: `eq.${orderId}`, order: 'created_at.asc' }) }); return (data || []).map((row) => ({ ...row, plan: row.plans ? mapPlan(row.plans) : null })); }
async function expirePendingOrders(client) { const now = new Date().toISOString(); const { data } = await request(client, 'orders', { query: `select=*&status=in.(waiting_payment,pending_payment)&expires_at=lt.${encodeURIComponent(now)}` }); const expired = data || []; for (const order of expired) await expireOrder(client, order); return expired; }

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
    body: { status, delivered_at: status === 'available' ? null : now, sold_at: status === 'sold' ? now : null, assigned_order_id: status === 'available' ? null : undefined, assigned_user_telegram_id: status === 'available' ? null : undefined, reserved_at: status === 'available' ? null : undefined },
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
      // on_conflict query parametri, header emas — aks holda PostgREST id bo'yicha
      // konflikt qidiradi va bir order uchun ikkinchi yozuv 409 bilan yiqiladi
      query: 'on_conflict=order_id',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
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
  createExceptionQueueItem,
  createAuditLog,
  getInventoryItemById,
  updateOrderItem,
  expireOrder,
  validatePromoCode,
  getUserBalance,
  addWalletTransaction,
  adjustWalletBalance,
  createCartItem,
  listCartItems,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  createCheckoutOrder,
  creditOrderCashback,
  generateUniquePrice,
  confirmPaymentNotification,
  enqueueDeliveryRetry,
  listDueDeliveryRetries,
  updateDeliveryRetry,
  completeDeliveryRetry,
  failDeliveryRetry,
  listStuckDeliveringOrders,
  cleanupProcessedPaymentMessages,
  updateMonitoringSnapshot,
  findWaitingOrderByUniquePrice,
  markOrderPaidFromPayment,
  insertPaymentLog,
  insertProcessedPaymentMessage,
  getOrderItems,
  expirePendingOrders,
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
