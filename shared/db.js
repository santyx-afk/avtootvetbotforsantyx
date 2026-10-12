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

// PostgREST "max-rows" (Supabase'da sukut bo'yicha 1000) tufayli bitta so'rov
// `limit=5000` bo'lsa ham jimgina eng ko'pi 1000 qator qaytaradi. Bu yordamchi
// offset bilan sahifalab HAMMA qatorni oladi; faqat bo'sh sahifada to'xtaydi
// (max-rows < pageSize bo'lsa ham to'g'ri). baseQuery'da barqaror `order`
// bo'lishi shart. Xato bo'lsa tashlaydi — qisman ro'yxat jimgina qaytmasin.
async function fetchAllRows(client, table, baseQuery, { pageSize = 1000, maxRows = 500000 } = {}) {
  const out = [];
  for (;;) {
    const { data } = await request(client, table, { query: `${baseQuery}&limit=${pageSize}&offset=${out.length}` });
    const rows = data || [];
    if (rows.length === 0) break;
    out.push(...rows);
    if (out.length >= maxRows) break;
  }
  return out;
}

// Pul tushgan buyurtma holatlari — dashboard tushumi va mijoz statistikasi
// uchun yagona ta'rif (biri boshqacha sanasa, raqamlar mos kelmay qoladi).
const PAID_ORDER_STATUSES = new Set(['completed', 'approved', 'payment_detected', 'delivering']);

// Sotilgan tovar qiymati: base_price − chegirma. Balansdan to'langan qism ham
// kiradi — mijoz uni ham sarflagan.
function orderSaleValue(o) {
  const base = o.base_price != null ? Number(o.base_price) : Number(o.amount || 0);
  return Math.max(0, base - Number(o.discount_amount || 0));
}

function isPaidPurchase(o) {
  return String(o.order_type || 'purchase') !== 'topup' && PAID_ORDER_STATUSES.has(o.status);
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

// Xush kelibsiz bonusi: yangi foydalanuvchi balansiga sozlamalardagi summa.
//
// Ikki marta to'lanmasligi UPDATE shartiga tayanadi: `welcome_bonus_at=is.null`
// bo'lgan qatorgina yangilanadi, ya'ni ikkita parallel so'rovdan faqat bittasi
// qatorni ushlaydi va bonusni beradi. Boshqasi bo'sh natija oladi va chiqadi.
async function grantWelcomeBonus(client, telegramId) {
  const settings = await fetchSettings(client).catch(() => null);
  const amount = Math.round(Number(settings?.welcome_bonus || 0));
  if (!(amount > 0)) return null;

  const { data } = await request(client, 'users', {
    method: 'PATCH',
    query: `telegram_id=eq.${encodeURIComponent(String(telegramId))}&welcome_bonus_at=is.null`,
    headers: { Prefer: 'return=representation' },
    body: { welcome_bonus_at: new Date().toISOString() },
  });
  if (!data?.length) return null; // boshqa so'rov ulgurdi — bonus allaqachon berilgan

  // `bonus` — wallet_transactions.type CHECK cheklovida ruxsat etilgan tur.
  return addWalletTransaction(client, {
    user_telegram_id: telegramId,
    amount,
    type: 'bonus',
    description: 'Xush kelibsiz sovg‘asi — ro‘yxatdan o‘tganingiz uchun',
  });
}

async function upsertUser(client, telegramUser) {
  const result = await request(client, 'users', {
    method: 'POST',
    // Javobda bonus/telefon holati qaytadi — chaqiruvchi (handleStart) raqam
    // so'rash kerakligini qo'shimcha so'rovsiz biladi.
    query: 'on_conflict=telegram_id&select=telegram_id,welcome_bonus_at,phone,phone_verified_at',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: {
      telegram_id: String(telegramUser.id),
      username: telegramUser.username || null,
      full_name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').trim(),
      language_code: telegramUser.language_code || 'uz',
      updated_at: new Date().toISOString(),
    },
  });

  // Diqqat: welcome bonus endi BU YERDA berilmaydi. 2026-08-27 da bitta
  // akkaunt 131 soxta akkaunt ochib bonuslarni yig'ib ketdi — akkaunt ochish
  // bepul, SIM esa emas. Bonus foydalanuvchi raqamini Telegram orqali
  // tasdiqlaganda to'lanadi (telegram-webhook kontakt bo'limi).
  return result;
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

// --- Leadlar (landing "izlagan obunangiz yo'qmi?" formasi) ---
async function createLead(client, { wanted, contact, name }) {
  const { data } = await request(client, 'leads', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { wanted, contact, name: name || null, status: 'new' },
  });
  return data?.[0] || null;
}

async function listLeads(client, limit = 200) {
  const { data } = await request(client, 'leads', {
    query: toQuery({ select: '*', order: 'created_at.desc', limit }),
  });
  return data || [];
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

// PostgREST/Postgres noyoblik buzilishi (unique_violation) xatosimi.
function isUniqueViolation(error, columnHint) {
  const msg = String(error?.message || '');
  if (!(msg.includes('23505') || /duplicate key/i.test(msg))) return false;
  return columnHint ? msg.includes(columnHint) : true;
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
  // order_number — tasodifiy 5 xonali son, bazada UNIQUE. Ilgari to'qnashuvda
  // INSERT jimgina yiqilar va buyurtma umuman yaratilmasdi (baza to'lgani sari
  // tez-tez). Endi to'qnashuvda faqat order_number ni qayta generatsiya qilib
  // qayta uramiz (chaqiruvchi aniq order_number bermagan bo'lsa).
  const callerGaveNumber = Boolean(order.order_number);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data } = await request(client, 'orders', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: payload,
      });
      return data?.[0] || null;
    } catch (error) {
      if (!callerGaveNumber && attempt < 7 && isUniqueViolation(error, 'order_number')) {
        payload.order_number = generateOrderNumber();
        continue;
      }
      throw error;
    }
  }
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
  if (expired) {
    // Checkout'da band qilingan balans bo'lsa — QAYTARAMIZ. PATCH sharti
    // (status in waiting_payment/pending_payment) atomik, faqat bitta chaqiruv
    // `expired` oladi, shuning uchun qaytarish ham bir marta bo'ladi.
    await refundOrderBalance(client, expired).catch((e) => console.warn('expire refund warn:', e?.message));
    // Band qilingan promokod foydalanishini ham qaytaramiz (abandon qilingan
    // buyurtma promokodni yeb qo'ymasin).
    await releasePromoUse(client, expired).catch((e) => console.warn('expire promo release warn:', e?.message));
    // Adminga ketgan "yangi buyurtma" xabaridan tugmalarni olib, holatni yozamiz.
    // Lazy require — admin-notify o'zi db'ga tayanadi (aylanma import bo'lmasin).
    await require('./admin-notify')
      .markOrderNotification(client, order.id, '⌛ Muddat o‘tdi — to‘lov kelmadi')
      .catch(() => {});
  }
  return expired;
}

async function getPromoCode(client, code) {
  if (!code) return null;
  const { data } = await request(client, 'promo_codes', { query: toQuery({ select: '*', code: `eq.${String(code).trim().toUpperCase()}`, is_active: 'eq.true', limit: 1 }) });
  return data?.[0] || null;
}

// Promokod tanlangan tovarlarga tegishlimi.
// `plan_ids` bo'sh yoki NULL bo'lsa — promokod hamma tovarga amal qiladi
// (eski promokodlar shu holatda, shuning uchun xatti-harakat o'zgarmaydi).
// Savatda bir nechta tovar bo'lsa, promokod ULARNING HAMMASIGA tegishli
// bo'lishi shart emas — kamida bittasiga tegsa yetarli, chegirma esa
// baribir umumiy summadan hisoblanadi.
function promoAppliesToPlans(promo, planIds) {
  const allowed = Array.isArray(promo?.plan_ids) ? promo.plan_ids.filter(Boolean) : [];
  if (!allowed.length) return true;
  const wanted = (Array.isArray(planIds) ? planIds : [planIds]).filter(Boolean).map(String);
  if (!wanted.length) return true; // tovar noma'lum — bu bosqichda to'smaymiz
  const allowedSet = new Set(allowed.map(String));
  return wanted.some((id) => allowedSet.has(id));
}

// `planIds` — buyurtmadagi reja(lar) id'si. Berilmasa tovar tekshiruvi
// o'tkazilmaydi (chaqiruvchi hali tovarni bilmasa).
async function validatePromoCode(client, code, basePrice, planIds = null) {
  const promo = await getPromoCode(client, code);
  if (!promo) return { ok: false, reason: 'not_found' };
  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired', promo };
  if (promo.max_uses && Number(promo.used_count || 0) >= Number(promo.max_uses)) return { ok: false, reason: 'usage_limit', promo };
  if (promo.min_order_amount && Number(basePrice || 0) < Number(promo.min_order_amount)) return { ok: false, reason: 'min_order', promo };
  if (planIds !== null && !promoAppliesToPlans(promo, planIds)) return { ok: false, reason: 'wrong_plan', promo };
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

// Balans o'zgarishi haqida mijozga yuboriladigan matn.
// Sabab tranzaksiya turiga qarab tanlanadi; `description` bo'lsa qo'shiladi.
const BALANCE_REASON = {
  cashback: 'Cashback',
  referral: 'Referal bonusi',
  credit: 'Hisob to‘ldirildi',
  debit: 'Xarid uchun yechildi',
  admin_credit: 'Administrator qo‘shdi',
  admin_debit: 'Administrator yechdi',
  bonus: 'Bonus',
  refund: 'Qaytarilgan mablag‘',
};

function balanceMessage({ type, amount, balance, description }) {
  const negative = type === 'debit' || type === 'admin_debit';
  const money = (v) => Number(v || 0).toLocaleString('uz-UZ');
  const reason = BALANCE_REASON[type] || 'Balans o‘zgarishi';
  return [
    negative
      ? `➖ <b>Balansingizdan ${money(amount)} UZS yechildi</b>`
      : `➕ <b>Balansingizga ${money(amount)} UZS qo‘shildi</b>`,
    '',
    `Sabab: ${reason}`,
    description ? `Izoh: ${description}` : null,
    '',
    `💰 Joriy balans: <b>${money(balance)} UZS</b>`,
  ].filter((line) => line !== null).join('\n');
}

// Balans o'zgarganda mijozga Telegram xabari. Xabar ketmasa ham balans
// o'zgarishi kuchda qoladi — shuning uchun xato yutiladi, faqat logga tushadi.
// `notify: false` bilan o'chirib qo'yish mumkin (ommaviy to'ldirishda xabarlar
// alohida, guruhlab yuboriladi).
async function notifyBalanceChange(item, wallet) {
  if (item.notify === false) return;
  try {
    // Dumaloq bog'liqlik yo'q: telegram.js faqat config'ga tayanadi.
    const { sendMessage } = require('./telegram');
    await sendMessage(
      String(item.user_telegram_id),
      balanceMessage({
        type: item.type,
        amount: Math.abs(Number(item.amount || 0)),
        balance: wallet?.balance,
        description: item.description,
      }),
      null,
    );
  } catch (error) {
    console.warn('balance notify warn:', error?.message);
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
  // Har qanday balans o'zgarishi shu funksiyadan o'tadi (cashback, referal,
  // admin, xarid, to'ldirish) — shuning uchun xabar ham shu yerda yuboriladi.
  await notifyBalanceChange(item, wallet);
  return { ...(data?.[0] || {}), wallet };
}

// Balansdan `amount` ni ATOMIK band qiladi (checkout paytida chaqiriladi).
//
// Nega kerak: ilgari balans checkout'da faqat O'QILARDI, band qilinmасди —
// yechish esa to'lov kelganda bo'lardi. Shu sabab bir foydalanuvchi bir xil
// balansni bir nechta buyurtmaga "ishlatib", keyin ularni to'lab, balansni
// manfiyga tushira olardi (double-spend). Endi balans DARHOL, faqat yetsa,
// band qilinadi.
//
// Compare-and-swap (CAS): joriy balansni o'qib, `balance=eq.<old>` sharti
// bilan yangilaymiz. Orada boshqa so'rov o'zgartirgan bo'lsa 0 qator qaytadi
// va qayta uriladi. Migratsiya shart emas — mavjud user_wallets ustuni ustida
// ishlaydi. Qaytaradi: haqiqatan band qilingan summa (balans yetmasa kamroq,
// yoki 0). Balans HECH QACHON manfiyga tushmaydi.
async function reserveWalletBalance(client, telegramId, amount) {
  const want = Math.max(0, Math.round(Number(amount || 0)));
  if (!(want > 0)) return 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const wallet = await getUserBalance(client, telegramId);
    const balance = Math.max(0, Number(wallet.balance || 0));
    const take = Math.min(balance, want);
    if (take <= 0) return 0;
    const { data } = await request(client, 'user_wallets', {
      method: 'PATCH',
      // Faqat balans hali o'sha bo'lsa yangilanadi (yo'qotilgan yangilanish bo'lmaydi).
      query: toQuery({ user_telegram_id: `eq.${telegramId}`, balance: `eq.${balance}` }),
      headers: { Prefer: 'return=representation' },
      body: { balance: balance - take, updated_at: new Date().toISOString() },
    });
    if (data?.[0]) return take;
    // Boshqa so'rov ulgurdi — qayta o'qib uriladi.
  }
  return 0;
}

// Band qilingan balansni buyurtmaga QAYTARADI (muddat o'tsa yoki rad etilsa).
// Bir buyurtma uchun faqat bir marta — audit_logs guard. Balans reserved
// bo'lgani uchun (checkout'da yechilgan) qaytarish uni oshiradi.
async function refundOrderBalance(client, order) {
  try {
    const amount = Math.round(Number(order?.balance_used || 0));
    if (!(amount > 0)) return false;
    const prior = await request(client, 'audit_logs', {
      query: `select=id&order_id=eq.${order.id}&action=eq.balance_refunded&limit=1`,
    }).then((r) => r.data).catch(() => []);
    if (prior && prior[0]) return false;
    await addWalletTransaction(client, {
      user_telegram_id: order.user_telegram_id,
      order_id: order.id,
      amount,
      type: 'refund',
      description: `Bekor qilingan buyurtma uchun qaytarildi #${order.order_number}`,
    });
    await createAuditLog(client, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'balance_refunded', status: 'completed', metadata: { amount } });
    return true;
  } catch (e) {
    console.warn('refundOrderBalance warn:', e?.message);
    return false;
  }
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
  const reserved = new Set((data || []).map((row) => Number(row.unique_price)));
  const start = Math.floor(Math.random() * 999) + 1;
  for (let i = 0; i < 999; i += 1) {
    const candidate = base + (((start + i - 1) % 999) + 1);
    if (!reserved.has(candidate)) return candidate;
  }
  throw new Error('No unique payment suffix available');
}

// Promokoddan bitta foydalanishni ATOMIK band qiladi (checkout paytida).
//
// Ilgari used_count checkout oxirida oddiy "o'qi → +1 → yoz" bilan oshirilardi:
// ikki parallel checkout ikkalasi ham used_count=4 (max 5) ni o'qib, ikkalasi
// 5 yozar — natijada max_uses dan oshib ketardi. Endi CAS (compare-and-swap)
// bilan faqat `used_count < max_uses` bo'lsa oshiriladi.
// Qaytaradi: true — band qilindi; false — limit tugagan (promokod berilmaydi).
async function reservePromoUse(client, promo) {
  if (!promo?.id) return true; // promokod yo'q — to'sqinlik yo'q
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: rows } = await request(client, 'promo_codes', {
      query: toQuery({ select: 'used_count,max_uses', id: `eq.${promo.id}`, limit: 1 }),
    }).catch(() => ({ data: null }));
    const row = rows?.[0];
    if (!row) return true; // topilmadi — bu bosqichda bloklamaymiz
    const used = Number(row.used_count || 0);
    const max = row.max_uses == null ? null : Number(row.max_uses);
    if (max != null && used >= max) return false; // limit tugagan
    const { data } = await request(client, 'promo_codes', {
      method: 'PATCH',
      query: toQuery({ id: `eq.${promo.id}`, used_count: `eq.${used}` }),
      headers: { Prefer: 'return=representation' },
      body: { used_count: used + 1 },
    }).catch(() => ({ data: null }));
    if (data?.[0]) return true;
    // Boshqa so'rov ulgurdi — qayta o'qib uriladi.
  }
  return false;
}

// used_count ni promokod kodi bo'yicha bittaga ATOMIK kamaytiradi (0 dan
// pastga tushmaydi). Guard'siz xom amal — chaqiruvchi idempotentlikni o'zi hal qiladi.
async function decrementPromoUsageByCode(client, code) {
  if (!code) return false;
  const { data: rows } = await request(client, 'promo_codes', {
    query: toQuery({ select: 'id,used_count', code: `eq.${String(code).trim().toUpperCase()}`, limit: 1 }),
  }).catch(() => ({ data: null }));
  const promo = rows?.[0];
  if (!promo?.id) return false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: cur } = await request(client, 'promo_codes', {
      query: toQuery({ select: 'used_count', id: `eq.${promo.id}`, limit: 1 }),
    }).catch(() => ({ data: null }));
    const used = Number(cur?.[0]?.used_count || 0);
    const next = Math.max(0, used - 1);
    if (next === used) return false; // allaqachon 0
    const { data } = await request(client, 'promo_codes', {
      method: 'PATCH',
      query: toQuery({ id: `eq.${promo.id}`, used_count: `eq.${used}` }),
      headers: { Prefer: 'return=representation' },
      body: { used_count: next },
    }).catch(() => ({ data: null }));
    if (data?.[0]) return true;
  }
  return false;
}

// Band qilingan promokod foydalanishini QAYTARADI (muddat o'tsa/rad etilsa).
// Bir buyurtma uchun faqat bir marta (audit guard) — abandon qilingan buyurtma
// promokodni "yeb qo'ymaydi".
async function releasePromoUse(client, order) {
  const code = order?.promo_code;
  if (!code || !order?.id) return false;
  try {
    const prior = await request(client, 'audit_logs', {
      query: `select=id&order_id=eq.${order.id}&action=eq.promo_use_released&limit=1`,
    }).then((r) => r.data).catch(() => []);
    if (prior && prior[0]) return false;
    // Guard'ni oldin yozamiz — release ikki marta bo'lmasin.
    await createAuditLog(client, { order_id: order.id, user_telegram_id: order.user_telegram_id, action: 'promo_use_released', status: 'completed', metadata: { code } });
    return await decrementPromoUsageByCode(client, code);
  } catch (e) {
    console.warn('releasePromoUse warn:', e?.message);
    return false;
  }
}

async function createCheckoutOrder(client, { user_telegram_id, items, expiresMinutes = Number(process.env.PAYMENT_EXPIRES_MINUTES || 30), promo = null, balanceUsed = 0, cashbackAmount = 0 }) {
  const basePrice = items.reduce((sum, item) => sum + Number(item.plan?.price || item.price || 0) * Number(item.quantity || 1), 0);

  // Promokod foydalanishini narx hisoblashdan OLDIN atomik band qilamiz. Band
  // qilib bo'lmasa (limit tugagan — validate bilan checkout orasida) promokodni
  // umuman qo'llamaymiz: mijoz chegirmasiz narx to'laydi, lekin max_uses oshmaydi.
  const promoReserved = promo ? await reservePromoUse(client, promo) : false;
  const activePromo = promoReserved ? promo : null;
  const discount = activePromo ? calculatePromoDiscount(basePrice, activePromo) : 0;
  const effectiveCashback = activePromo ? Number(cashbackAmount || 0) : 0;
  const payableAfterPromo = Math.max(0, basePrice - discount);

  // Balansni SHU YERDA, atomik band qilamiz — chaqiruvchi bergan `balanceUsed`
  // faqat "nechani ishlatmoqchi" degan tilak. Haqiqatan yechilgan summa
  // (reservedBalance) balans yetishiga qarab kamroq bo'lishi mumkin. Shu tufayli
  // narx band qilingandan KEYIN hisoblanadi va double-spend bo'lmaydi.
  const wantBalance = Math.min(Math.max(0, Math.round(Number(balanceUsed || 0))), payableAfterPromo);
  const reservedBalance = wantBalance > 0 ? await reserveWalletBalance(client, user_telegram_id, wantBalance) : 0;

  const payableBase = Math.max(0, payableAfterPromo - reservedBalance);
  let uniquePrice = payableBase > 0 ? await generateUniquePrice(client, payableBase) : 0;
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
  let order;
  // unique_price to'qnashuviga qarshi: bir vaqtda ikki checkout bir xil summani
  // olib qolsa (generateUniquePrice o'qigach), partial unique index (migratsiya
  // 2026-09-23) INSERT ni rad etadi — biz suffiksni qayta generatsiya qilib
  // qayta uramiz. Index hali qo'llanmagan bo'lsa hech qanday konflikt bo'lmaydi
  // va bu sikl bir marta ishlaydi (eski xatti-harakat).
  for (let attempt = 0; ; attempt += 1) {
    try {
      order = await createOrder(client, { user_telegram_id, plan_id: items[0]?.plan_id || items[0]?.plan?.id || null, amount: uniquePrice, base_price: basePrice, unique_price: uniquePrice, expires_at: expiresAt, status: uniquePrice > 0 ? 'waiting_payment' : 'payment_detected', delivery_status: 'waiting_approval', payment_method: 'humo_card_bot', payment_source: uniquePrice > 0 ? 'humo_card_bot' : 'balance', promo_code: activePromo?.code || null, discount_amount: discount, balance_used: reservedBalance, cashback_amount: effectiveCashback });
      break;
    } catch (error) {
      if (uniquePrice > 0 && attempt < 5 && isUniqueViolation(error, 'unique_price')) {
        uniquePrice = await generateUniquePrice(client, payableBase);
        continue;
      }
      // Buyurtma yaratilmasa band qilingan resurslarni QAYTARAMIZ — aks holda
      // balans yechilgan-u yoki promokod "band"-u, buyurtma yo'q bo'lib qolardi.
      if (reservedBalance > 0) {
        await adjustWalletBalance(client, user_telegram_id, reservedBalance).catch((e) => console.warn('reserve rollback warn:', e?.message));
      }
      if (promoReserved && activePromo) {
        await decrementPromoUsageByCode(client, activePromo.code).catch(() => {});
      }
      throw error;
    }
  }
  // Band qilingan balans uchun tranzaksiya izi (balans tarixida ko'rinsin).
  // Balansning O'ZI yuqorida reserveWalletBalance orqali yechilgan — bu faqat yozuv.
  if (reservedBalance > 0) {
    await request(client, 'wallet_transactions', {
      method: 'POST',
      body: { user_telegram_id: String(user_telegram_id), order_id: order.id, amount: reservedBalance, type: 'debit', description: `Buyurtma uchun balansdan #${order.order_number}` },
    }).catch((e) => console.warn('reserve tx warn:', e?.message));
  }
  // Buyurtma elementlari BITTA so'rovda yoziladi (PostgREST massivni qabul
  // qiladi). Ilgari har bir dona uchun alohida, ketma-ket so'rov ketardi —
  // 3 ta tovar 3 ta bosqich edi. Promokod hisoblagichi ham shu bilan parallel.
  const orderItems = [];
  for (const item of items) {
    const unit = Number(item.plan?.price || item.price || 0);
    for (let i = 0; i < Number(item.quantity || 1); i += 1) {
      orderItems.push({ order_id: order.id, user_telegram_id: String(user_telegram_id), plan_id: item.plan_id || item.plan?.id, quantity: 1, unit_price: unit, total_price: unit, delivery_status: 'pending' });
    }
  }
  // Eslatma: promokod used_count endi YUQORIDA, reservePromoUse orqali atomik
  // oshirilgan (bu yerda emas) — shuning uchun faqat buyurtma elementlari yoziladi.
  if (orderItems.length) {
    await request(client, 'order_items', { method: 'POST', body: orderItems });
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

// Telegram update'ini bir marta qayta ishlashni kafolatlaydi (idempotentlik).
// Telegram javob kechiksa o'sha update'ni qayta yuboradi — takror ishlov
// balansni ikki marta o'zgartirishi yoki xabarni takrorlashi mumkin edi.
//
// update_id PRIMARY KEY: birinchi INSERT qatorni qaytaradi (true = yangi),
// takror INSERT ignore-duplicates tufayli bo'sh qaytaradi (false = takror).
// FAIL-OPEN: processed_updates jadvali yo'q (migratsiya qo'llanmagan) yoki baza
// javob bermasa — true qaytaramiz, ya'ni bot to'xtamaydi, oddiy ishlaydi.
async function markUpdateProcessed(client, updateId) {
  if (updateId === undefined || updateId === null || updateId === '') return true;
  try {
    const { data } = await request(client, 'processed_updates', {
      method: 'POST',
      query: 'on_conflict=update_id',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: { update_id: Number(updateId) },
    });
    return Boolean(data?.[0]); // yangi bo'lsa true, takror bo'lsa false
  } catch (e) {
    console.warn('processed_updates check skipped (fail-open):', e?.message);
    return true;
  }
}

async function cleanupProcessedUpdates(client, days = 2) {
  const cutoff = new Date(Date.now() - Number(days || 2) * 24 * 60 * 60 * 1000).toISOString();
  return request(client, 'processed_updates', { method: 'DELETE', query: toQuery({ created_at: `lt.${cutoff}` }) }).catch(() => null);
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

// Admin to'lovni qo'lda "keldi" deb belgilaydi (tizim aniqlamagan, lekin pul
// kelgan). Faqat to'lov kutilayotgan va muddati o'tmagan buyurtma uchun —
// qoida admin-notify.canMarkPaid'da, tugma va panel bir xil tekshiradi.
// Holat o'zgarishi markOrderPaidFromPayment orqali (status sharti bilan) —
// avtomatik aniqlash bilan bir vaqtda kelsa ham ikki marta o'tmaydi.
async function markOrderPaidManually(client, orderId, adminId) {
  const order = await getOrderById(client, orderId);
  const check = require('./admin-notify').canMarkPaid(order);
  if (!check.ok) return { ok: false, reason: check.reason, order };
  const paid = await markOrderPaidFromPayment(client, orderId, {
    payment_source: 'manual_admin',
    payment_message_id: `manual:${String(adminId)}:${Date.now()}`,
  });
  if (!paid) return { ok: false, reason: 'already_processed', order: await getOrderById(client, orderId) };
  await createAuditLog(client, {
    order_id: orderId,
    user_telegram_id: order.user_telegram_id,
    action: 'payment_marked_manually',
    status: 'payment_detected',
    metadata: { admin: String(adminId), amount: Number(order.unique_price || order.amount || 0) },
  });
  return { ok: true, order: paid };
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
  // Rad etilgan buyurtmada checkout'da band qilingan balans/promokodni qaytaramiz.
  await refundOrderBalance(client, data[0]).catch((e) => console.warn('reject refund warn:', e?.message));
  await releasePromoUse(client, data[0]).catch((e) => console.warn('reject promo release warn:', e?.message));
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
  // Yangi qo'shilganlar tepada — admin oxirgi kiritganini darhol ko'radi.
  const { data } = await request(client, 'inventory_items', {
    query: toQuery({ select: '*', plan_id: `eq.${planId}`, order: 'created_at.desc' }),
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
  fetchAllRows,
  PAID_ORDER_STATUSES,
  orderSaleValue,
  isPaidPurchase,
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
  createLead,
  listLeads,
  countRows,
  listRecentEvents,
  listEventsByType,
  mapCategory,
  mapPlan,
  toQuery,
  createOrder,
  isUniqueViolation,
  createExceptionQueueItem,
  createAuditLog,
  getInventoryItemById,
  updateOrderItem,
  expireOrder,
  getPromoCode,
  validatePromoCode,
  promoAppliesToPlans,
  reservePromoUse,
  releasePromoUse,
  grantWelcomeBonus,
  rpcRequest,
  getUserBalance,
  addWalletTransaction,
  adjustWalletBalance,
  reserveWalletBalance,
  refundOrderBalance,
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
  markOrderPaidManually,
  insertPaymentLog,
  insertProcessedPaymentMessage,
  markUpdateProcessed,
  cleanupProcessedUpdates,
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
