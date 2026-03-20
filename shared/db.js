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
  const { data } = await request(client, 'plans', { query: `select=*&id=eq.${planId}` });
  return data?.[0] ? mapPlan(data[0]) : null;
}

async function fetchCategory(client, categoryId) {
  const { data } = await request(client, 'categories', { query: `select=*&id=eq.${categoryId}` });
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
  const { data } = await request(client, 'user_states', { query: `select=state&telegram_id=eq.${telegramId}` });
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
  return request(client, 'receipt_submissions', { method: 'POST', body: item });
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
  const { data } = await request(client, 'analytics_events', { query: `select=*&order=created_at.desc&limit=${limit}` });
  return data || [];
}

async function listEventsByType(client, eventType, key) {
  const { data } = await request(client, 'analytics_events', { query: `select=${key}&event_type=eq.${eventType}` });
  return data || [];
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
};
