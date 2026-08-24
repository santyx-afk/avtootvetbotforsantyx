const state = {
  categories: [], plans: [], settings: null, orders: [], inventory: [],
  banners: [], promos: [], reviews: [], faq: [], users: [], leads: [],
  ordersTotal: 0,
  usersShown: 100,
};

// Jadvallar innerHTML orqali chiziladi, ma'lumotning bir qismi esa
// foydalanuvchi kiritgan matn (Telegram ismi/username, sharh, lead, izoh).
// Escape qilinmasa admin panelda saqlangan XSS bo'ladi: mijoz o'z Telegram
// ismiga <img onerror=...> yozib qo'ysa, admin sahifani ochganda skript
// admin sessiyasi ichida ishga tushadi. Har bir dinamik qiymat shu funksiyadan
// o'tishi SHART.
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
}

function money(value) {
  return Number(value || 0).toLocaleString('uz-UZ');
}

// Sana: bo'sh bo'lsa "—", noto'g'ri bo'lsa xom qiymat (escape qilingan holda).
function dt(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleString('uz-UZ');
}

// Batafsil oynalardagi bitta "yorliq + qiymat" kartochkasi.
function cell(label, value) {
  return `<div class="detail-cell"><span class="k">${esc(label)}</span><span class="v">${esc(value ?? '—')}</span></div>`;
}

// Foydalanuvchini ko'rsatish uchun qulay yorliq: @username yoki ism yoki ID.
function userLabel(u = {}) {
  if (u.username) return `@${u.username}`;
  if (u.full_name) return u.full_name;
  return String(u.telegram_id ?? '—');
}

const views = {
  dashboard: document.getElementById('dashboardView'),
  categories: document.getElementById('categoriesView'),
  plans: document.getElementById('plansView'),
  orders: document.getElementById('ordersView'),
  inventory: document.getElementById('inventoryView'),
  banners: document.getElementById('bannersView'),
  promos: document.getElementById('promosView'),
  reviews: document.getElementById('reviewsView'),
  faq: document.getElementById('faqView'),
  users: document.getElementById('usersView'),
  vacancy: document.getElementById('vacancyView'),
  leads: document.getElementById('leadsView'),
  messages: document.getElementById('messagesView'),
  settings: document.getElementById('settingsView'),
  help: document.getElementById('helpView'),
};

async function api(url, options = {}) {
  const response = await fetch(`/api/${url}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Server JSON emas javob qaytardi (masalan timeout/gateway HTML sahifasi)
    if (!response.ok) throw new Error(`Server xatosi (${response.status})`);
    // OK bo'lsa-yu JSON bo'lmasa — bo'sh obyekt bilan davom etamiz
  }
  if (!response.ok) throw new Error(data.error || 'So\'rovda xatolik');
  return data;
}

async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/admin-upload', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Yuklash xatosi');
  return data.url;
}

function switchView(name) {
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  Object.entries(views).forEach(([key, element]) => {
    if (element) element.hidden = key !== name;
  });
}

function renderStats(stats) {
  const cards = [
    ['Jami foydalanuvchi', stats.totalUsers],
    ['Jami kliklar', stats.totalClicks],
    ['To\'lov sahifasi ochilishi', stats.totalPaymentOpens],
    ['Bugungi tushum', Number(stats.revenueToday || 0).toLocaleString('uz-UZ')],
    ['Haftalik tushum', Number(stats.revenueWeek || 0).toLocaleString('uz-UZ')],
    ['Oylik tushum', Number(stats.revenueMonth || 0).toLocaleString('uz-UZ')],
    ['Referallar', stats.totalReferrals || 0],
    ['Referal bonuslari', Number(stats.referralBonusTotal || 0).toLocaleString('uz-UZ')],
  ];
  document.getElementById('statsCards').innerHTML = cards.map(([label, value]) => `<div class="card"><h3>${esc(label)}</h3><strong>${esc(value ?? 0)}</strong></div>`).join('');
  // API qisman javob qaytarsa ham dashboard qulamasin — har bir ro'yxat guard bilan.
  const list = (rows, fn) => (Array.isArray(rows) ? rows : []).map(fn).join('') || '<li>Ma\'lumot yo\'q</li>';
  document.getElementById('topCategories').innerHTML = list(stats.mostViewedCategories, (item) => `<li>${esc(item.name)}: ${esc(item.total)}</li>`);
  document.getElementById('topPlans').innerHTML = list(stats.mostViewedPlans, (item) => `<li>${esc(item.name)}: ${esc(item.total)}</li>`);
  document.getElementById('topPayments').innerHTML = list(stats.mostPaymentClicks, (item) => `<li>${esc(item.name)}: ${esc(item.total)}</li>`);
  document.getElementById('eventLogs').innerHTML = list(stats.eventLogs, (item) => `<li><strong>${esc(item.event_type)}</strong> — ${dt(item.created_at)}</li>`);

  // Revenue chart
  if (typeof Chart !== 'undefined' && stats.dailyRevenue) {
    renderRevenueChart(stats.dailyRevenue);
  }
}

let revenueChartInstance = null;
function renderRevenueChart(dailyRevenue) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (revenueChartInstance) revenueChartInstance.destroy();
  const labels = dailyRevenue.map((d) => d.date);
  const data = dailyRevenue.map((d) => d.revenue);
  revenueChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Tushum (UZS)', data, backgroundColor: '#2563eb', borderRadius: 8 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function exportCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function renderCategories() {
  const root = document.getElementById('categoriesList');
  root.innerHTML = `<table><thead><tr><th>Nomi</th><th>Slug</th><th>Tartib</th><th>Holat</th><th></th></tr></thead><tbody>${state.categories.map((item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${esc(item.slug)}</td>
      <td>${esc(item.sort_order)}</td>
      <td><span class="badge">${item.is_active ? 'Faol' : 'NoFaol'}</span></td>
      <td>
        <button class="ghost edit-category" data-id="${item.id}">Edit</button>
        <button class="ghost danger delete-item" data-type="category" data-id="${item.id}">Delete</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  const categorySelect = document.getElementById('planCategoryId');
  categorySelect.innerHTML = state.categories.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
}

function renderPlans() {
  const root = document.getElementById('plansList');
  root.innerHTML = `<table><thead><tr><th>Nomi</th><th>Kategoriya</th><th>Narx</th><th>Rasm</th><th>Tartib</th><th></th></tr></thead><tbody>${state.plans.map((item) => `
    <tr>
      <td>${esc(item.name)}${item.is_popular ? ' ⭐' : ''}</td>
      <td>${esc(state.categories.find((category) => category.id === item.category_id)?.name || '-')}</td>
      <td>${money(item.price)} ${esc(item.currency)}</td>
      <td>${item.image_url ? '<span class="badge">✓</span>' : '-'}</td>
      <td>${esc(item.sort_order)}</td>
      <td>
        <button class="ghost edit-plan" data-id="${item.id}">Edit</button>
        <button class="ghost danger delete-item" data-type="plan" data-id="${item.id}">Delete</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  const parentSelect = document.getElementById('planParentPlanId');
  const planOptions = state.plans.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  parentSelect.innerHTML = `<option value="">Yo'q</option>${state.plans.filter((item) => !item.parent_plan_id).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`;
  document.getElementById('inventoryPlanId').innerHTML = planOptions;
  document.getElementById('inventoryPlanIdCreate').innerHTML = planOptions;
}

function fillCategoryForm(item = {}) {
  document.getElementById('categoryId').value = item.id || '';
  document.getElementById('categoryName').value = item.name || '';
  document.getElementById('categorySlug').value = item.slug || '';
  document.getElementById('categoryButtonLabel').value = item.button_label || '';
  document.getElementById('categorySortOrder').value = item.sort_order || 1;
  document.getElementById('categoryDescription').value = item.description || '';
  document.getElementById('categoryIsActive').checked = item.is_active ?? true;
  document.getElementById('categoryFormTitle').textContent = item.id ? 'Kategoriyani tahrirlash' : 'Kategoriya qo\'shish';
}

function fillPlanForm(item = {}) {
  document.getElementById('planId').value = item.id || '';
  document.getElementById('planCategoryId').value = item.category_id || state.categories[0]?.id || '';
  document.getElementById('planParentPlanId').value = item.parent_plan_id || '';
  document.getElementById('planName').value = item.name || '';
  document.getElementById('planButtonLabel').value = item.button_label || '';
  document.getElementById('planPrice').value = item.price || '';
  document.getElementById('planCurrency').value = item.currency || 'UZS';
  document.getElementById('planOldPrice').value = item.old_price || '';
  document.getElementById('planOfficialPrice').value = item.official_price || '';
  document.getElementById('planIsPopular').checked = item.is_popular ?? false;
  document.getElementById('planTags').value = Array.isArray(item.tags) ? item.tags.join(',') : '';
  document.getElementById('planDeliveryType').value = item.delivery_type || 'manual';
  document.getElementById('planDuration').value = item.duration || '';
  document.getElementById('planSortOrder').value = item.sort_order || 1;
  document.getElementById('planImageUrl').value = item.image_url || '';
  document.getElementById('planWarrantyText').value = item.warranty_text || '';
  document.getElementById('planRulesText').value = item.rules_text || '';
  document.getElementById('planDescription').value = item.description || '';
  document.getElementById('planHowItWorksText').value = item.how_it_works_text || '';
  document.getElementById('planPaymentInstructions').value = item.payment_instructions || '';
  document.getElementById('planDeliveryInstructions').value = item.delivery_instructions || '';
  document.getElementById('planIsActive').checked = item.is_active ?? true;
  document.getElementById('planFormTitle').textContent = item.id ? 'Rejani tahrirlash' : 'Reja qo\'shish';
  const preview = document.getElementById('planImagePreview');
  if (item.image_url) { preview.src = item.image_url; preview.style.display = 'block'; }
  else { preview.src = ''; preview.style.display = 'none'; }
}

// --- Banners ---
function renderBanners() {
  const root = document.getElementById('bannersList');
  root.innerHTML = `<table><thead><tr><th>Sarlavha</th><th>Rasm</th><th>Tartib</th><th>Holat</th><th></th></tr></thead><tbody>${state.banners.map((b) => `
    <tr>
      <td>${esc(b.title)}</td>
      <td>${b.image_url ? '<span class="badge">✓</span>' : '-'}</td>
      <td>${esc(b.sort_order || 0)}</td>
      <td><span class="badge">${b.is_active ? 'Faol' : 'NoFaol'}</span></td>
      <td>
        <button class="ghost edit-banner" data-id="${b.id}">Edit</button>
        <button class="ghost danger delete-banner" data-id="${b.id}">Delete</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function fillBannerForm(item = {}) {
  document.getElementById('bannerId').value = item.id || '';
  document.getElementById('bannerTitle').value = item.title || '';
  document.getElementById('bannerSubtitle').value = item.subtitle || '';
  document.getElementById('bannerBtnText').value = item.btn_text || '';
  document.getElementById('bannerLink').value = item.link || '';
  document.getElementById('bannerGradient').value = item.gradient || '';
  document.getElementById('bannerSortOrder').value = item.sort_order || 1;
  document.getElementById('bannerImageUrl').value = item.image_url || '';
  document.getElementById('bannerIsActive').checked = item.is_active ?? true;
  document.getElementById('bannerFormTitle').textContent = item.id ? 'Banner tahrirlash' : 'Banner qo\'shish';
  const preview = document.getElementById('bannerImagePreview');
  if (item.image_url) { preview.src = item.image_url; preview.style.display = 'block'; }
  else { preview.src = ''; preview.style.display = 'none'; }
}

// --- Promos ---
function renderPromos() {
  const root = document.getElementById('promosList');
  root.innerHTML = `<table><thead><tr><th>Kod</th><th>Chegirma</th><th>Min buyurtma</th><th>Ishlatildi</th><th>Muddat</th><th>Holat</th><th></th></tr></thead><tbody>${state.promos.map((p) => `
    <tr>
      <td><strong>${esc(p.code)}</strong>${p.is_one_time ? ' <span class="badge">1x</span>' : ''}</td>
      <td>${money(p.discount_value)}${p.discount_type === 'fixed' ? ' UZS' : p.discount_type === 'cashback_percent' ? '% cashback' : '%'}</td>
      <td>${money(p.min_order_amount)}</td>
      <td>${esc(p.used_count || 0)}${p.max_uses ? `/${esc(p.max_uses)}` : ''}</td>
      <td>${p.expires_at ? esc(String(p.expires_at).slice(0, 10)) : '-'}</td>
      <td><span class="badge">${p.is_active ? 'Faol' : 'NoFaol'}</span></td>
      <td>
        <button class="ghost promo-usage" data-code="${esc(p.code)}">Batafsil</button>
        <button class="ghost edit-promo" data-id="${esc(p.id)}">Edit</button>
        <button class="ghost danger delete-promo" data-id="${esc(p.id)}">Del</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function fillPromoForm(item = {}) {
  document.getElementById('promoId').value = item.id || '';
  document.getElementById('promoCode').value = item.code || '';
  document.getElementById('promoDiscountType').value = item.discount_type || 'percent';
  document.getElementById('promoDiscountValue').value = item.discount_value ?? '';
  document.getElementById('promoMinOrder').value = item.min_order_amount ?? 0;
  document.getElementById('promoMaxUses').value = item.max_uses ?? '';
  document.getElementById('promoExpiresAt').value = item.expires_at ? String(item.expires_at).slice(0, 10) : '';
  document.getElementById('promoIsOneTime').checked = item.is_one_time ?? false;
  document.getElementById('promoIsActive').checked = item.is_active ?? true;
  document.getElementById('promoFormTitle').textContent = item.id ? 'Promokodni tahrirlash' : 'Promokod qo\'shish';
}

// --- Reviews ---
function renderReviews() {
  const root = document.getElementById('reviewsList');
  const statusFilter = document.getElementById('reviewStatusFilter')?.value || '';
  const filtered = statusFilter ? state.reviews.filter((r) => r.status === statusFilter) : state.reviews;
  root.innerHTML = `<table><thead><tr><th>Foydalanuvchi</th><th>Reja</th><th>Baho</th><th>Sharh</th><th>Holat</th><th></th></tr></thead><tbody>${filtered.map((r) => `
    <tr>
      <td>${esc(r.user_telegram_id)}</td>
      <td>${esc(state.plans.find((p) => p.id === r.plan_id)?.name || r.plan_id)}</td>
      <td class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, Number(r.rating) || 0)))}</td>
      <td>${esc(r.text || '-')}</td>
      <td><span class="badge">${esc(r.status || 'pending')}</span></td>
      <td>
        ${r.status !== 'approved' ? `<button class="ghost review-action" data-action="approve" data-id="${r.id}">✓</button>` : ''}
        ${r.status !== 'rejected' ? `<button class="ghost danger review-action" data-action="reject" data-id="${r.id}">✕</button>` : ''}
        <button class="ghost danger review-action" data-action="delete" data-id="${r.id}">Del</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

// --- FAQ ---
function renderFaq() {
  const root = document.getElementById('faqList');
  root.innerHTML = `<table><thead><tr><th>Savol</th><th>Tartib</th><th>Holat</th><th></th></tr></thead><tbody>${state.faq.map((f, idx) => `
    <tr>
      <td>${esc(f.question)}</td>
      <td>${esc(f.sort_order || 0)}</td>
      <td><span class="badge">${f.is_active ? 'Faol' : 'NoFaol'}</span></td>
      <td class="faq-order-btns">
        ${idx > 0 ? `<button class="ghost faq-move" data-id="${f.id}" data-dir="up">↑</button>` : ''}
        ${idx < state.faq.length - 1 ? `<button class="ghost faq-move" data-id="${f.id}" data-dir="down">↓</button>` : ''}
        <button class="ghost edit-faq" data-id="${f.id}">Edit</button>
        <button class="ghost danger delete-faq" data-id="${f.id}">Del</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function fillFaqForm(item = {}) {
  document.getElementById('faqId').value = item.id || '';
  document.getElementById('faqQuestion').value = item.question || '';
  document.getElementById('faqAnswer').value = item.answer || '';
  document.getElementById('faqSortOrder').value = item.sort_order || 1;
  document.getElementById('faqIsActive').checked = item.is_active ?? true;
  document.getElementById('faqFormTitle').textContent = item.id ? 'Savolni tahrirlash' : 'Savol qo\'shish';
}

// --- Users ---
function renderUsers(filter = '') {
  const q = filter.toLowerCase();
  const filtered = q ? state.users.filter((u) =>
    String(u.telegram_id).includes(q) ||
    (u.username || '').toLowerCase().includes(q) ||
    (u.full_name || '').toLowerCase().includes(q)
  ) : state.users;
  const root = document.getElementById('usersList');
  // Ilgari qat'iy 100 ta ko'rsatilib "+N ta yana..." deb yozilardi va qolganiga
  // yetib bo'lmasdi. Endi "Yana ko'rsatish" tugmasi bilan ochiladi.
  const shown = filtered.slice(0, state.usersShown);
  root.innerHTML = `<table><thead><tr><th>Telegram ID</th><th>Username</th><th>Ism</th><th>Balans</th><th>Xaridlar</th><th>Faollik</th><th>Blocked</th><th></th></tr></thead><tbody>${shown.map((u) => `
    <tr>
      <td>${esc(u.telegram_id)}</td>
      <td>${u.username ? `@${esc(u.username)}` : '-'}</td>
      <td>${esc(u.full_name || '-')}</td>
      <td>${money(u.balance)}</td>
      <td>${esc(u.purchases || 0)}</td>
      <td>${u.last_activity ? esc(new Date(u.last_activity).toLocaleDateString('uz-UZ')) : '-'}</td>
      <td>${u.is_blocked ? '🚫' : '-'}</td>
      <td>
        <button class="ghost user-detail" data-id="${esc(u.telegram_id)}">Batafsil</button>
        <button class="ghost user-action" data-action="${u.is_blocked ? 'unblock' : 'block'}" data-id="${esc(u.telegram_id)}">${u.is_blocked ? 'Unblock' : 'Block'}</button>
        <button class="ghost user-msg" data-id="${esc(u.telegram_id)}">Xabar</button>
      </td>
    </tr>`).join('')}</tbody></table>`;

  const countEl = document.getElementById('usersCount');
  if (countEl) {
    countEl.textContent = filtered.length
      ? `${shown.length} / ${filtered.length} ta ko'rsatilmoqda (jami ${state.users.length})`
      : 'Foydalanuvchi topilmadi';
  }
  const moreBtn = document.getElementById('usersLoadMore');
  if (moreBtn) moreBtn.hidden = filtered.length <= shown.length;
}

async function loadDashboard() {
  renderStats((await api('admin-dashboard')).stats);
}

async function loadData() {
  const data = await api('admin-data');
  state.categories = data.categories;
  state.plans = data.plans;
  renderCategories();
  renderPlans();
  await loadOrders();
  await loadInventory();
}

const ORDERS_PAGE = 100;

// Buyurtmalar. Ilgari server qat'iy 50 ta qaytarardi va frontend uni oshirmasdi
// — 500+ buyurtmadan faqat oxirgi 50 tasi ko'rinardi. Endi qidiruv (№ yoki
// Telegram ID) va "Yana yuklash" (offset) bor.
async function loadOrders({ append = false } = {}) {
  const status = document.getElementById('orderStatusFilter')?.value || '';
  const search = document.getElementById('orderSearch')?.value.trim() || '';
  const offset = append ? state.orders.length : 0;

  const params = new URLSearchParams({ limit: String(ORDERS_PAGE), offset: String(offset) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  const data = await api(`admin-orders?${params.toString()}`);
  const batch = data.orders || [];
  state.orders = append ? [...state.orders, ...batch] : batch;
  state.ordersTotal = Number(data.total ?? state.orders.length);

  renderOrders();
  renderRecentOrders();
}

function renderOrders() {
  const root = document.getElementById('ordersList');
  if (!root) return;
  if (!state.orders.length) {
    root.innerHTML = '<p class="detail-empty">Buyurtma topilmadi.</p>';
  } else {
    root.innerHTML = `<table><thead><tr><th>№</th><th>User</th><th>Reja</th><th>Summa</th><th>Promo</th><th>Chegirma</th><th>Status</th><th>Delivery</th><th>Vaqt</th><th>Amal</th></tr></thead><tbody>${state.orders.map((o) => {
      const canApprove = ['payment_uploaded', 'checking'].includes(o.status);
      const isProcessed = ['approved', 'rejected', 'completed', 'cancelled'].includes(o.status);
      return `
  <tr>
    <td>${esc(o.order_number)}</td>
    <td>${esc(o.user_telegram_id)}</td>
    <td>${esc(o.plan_name || '-')}</td>
    <td>${money(o.unique_price ?? o.amount)}</td>
    <td>${o.promo_code ? `<span class="badge">${esc(o.promo_code)}</span>` : '-'}</td>
    <td>${Number(o.discount_amount || 0) > 0 ? `−${money(o.discount_amount)}` : '-'}</td>
    <td>${esc(o.status)}</td>
    <td>${esc(o.delivery_status || '-')}</td>
    <td>${dt(o.created_at)}</td>
    <td>
      <button class="ghost order-detail" data-id="${esc(o.id)}">Batafsil</button>
      <button class="ghost order-action" data-action="approve" data-id="${esc(o.id)}" ${canApprove ? '' : 'disabled'}>Approve</button>
      <button class="ghost danger order-action" data-action="reject" data-id="${esc(o.id)}" ${isProcessed ? 'disabled' : ''}>Reject</button>
      <button class="ghost order-action" data-action="retry_delivery" data-id="${esc(o.id)}">Retry</button>
      <button class="ghost order-action" data-action="complete" data-id="${esc(o.id)}">Complete</button>
    </td>
  </tr>`;
    }).join('')}</tbody></table>`;
  }

  const countEl = document.getElementById('ordersCount');
  if (countEl) countEl.textContent = `${state.orders.length} / ${state.ordersTotal} ta buyurtma`;
  const moreBtn = document.getElementById('ordersLoadMore');
  if (moreBtn) moreBtn.hidden = state.orders.length >= state.ordersTotal;
}

// Dashboard uchun so'nggi 6 ta buyurtma (faqat ko'rish)
function renderRecentOrders() {
  const root = document.getElementById('recentOrders');
  if (!root) return;
  const recent = state.orders.slice(0, 6);
  if (!recent.length) { root.innerHTML = '<p>Buyurtmalar yo\'q</p>'; return; }
  root.innerHTML = `<table><thead><tr><th>№</th><th>User</th><th>Reja</th><th>Summa</th><th>Status</th><th>Vaqt</th></tr></thead><tbody>${recent.map((o) => `
    <tr><td>${esc(o.order_number)}</td><td>${esc(o.user_telegram_id)}</td><td>${esc(o.plan_name || '-')}</td><td>${money(o.unique_price ?? o.amount)}</td><td><span class="badge">${esc(o.status)}</span></td><td>${dt(o.created_at)}</td></tr>`).join('')}</tbody></table>`;
}

async function loadInventory() {
  const planId = document.getElementById('inventoryPlanId')?.value;
  if (!planId) return;
  const data = await api(`admin-inventory?plan_id=${encodeURIComponent(planId)}`);
  state.inventory = data.items || [];
  const c = data.counts || {};
  document.getElementById('inventoryCounts').innerHTML = `available:${c.available || 0}, reserved:${c.reserved || 0}, delivered:${c.delivered || 0}, sold:${c.sold || 0}, disabled:${c.disabled || 0}`;
  renderInventory();
}

function renderInventory() {
  const root = document.getElementById('inventoryList');
  if (!root) return;
  const statusFilter = document.getElementById('inventoryStatusFilter')?.value || '';
  const rows = statusFilter ? state.inventory.filter((i) => i.status === statusFilter) : state.inventory;

  if (!rows.length) {
    root.innerHTML = '<p class="detail-empty">Bu filtr bo\'yicha akkaunt yo\'q.</p>';
    return;
  }

  // "Kimga" va "Sotilgan" ustunlari: bu ma'lumot bazada allaqachon bor edi
  // (assigned_user_telegram_id, sold_at/delivered_at) — faqat ko'rsatilmasdi.
  root.innerHTML = `<table><thead><tr><th>Type</th><th>Login</th><th>Password</th><th>Key</th><th>Status</th><th>Kimga</th><th>Sotilgan</th><th>Qo'shilgan</th><th></th></tr></thead><tbody>${rows.map((i) => {
    const soldAt = i.sold_at || i.delivered_at || i.reserved_at;
    return `<tr data-inv-id="${esc(i.id)}">
  <td>${esc(i.type)}</td>
  <td class="inv-login">${esc(i.login || '-')}</td>
  <td class="inv-pass">${esc(i.password_encrypted || '-')}</td>
  <td class="inv-key">${esc(i.license_key_encrypted || '-')}</td>
  <td>${esc(i.status)}</td>
  <td>${i.assigned_user_telegram_id ? esc(i.assigned_user_telegram_id) : '-'}</td>
  <td>${soldAt ? dt(soldAt) : '-'}</td>
  <td>${dt(i.created_at)}</td>
  <td>
    <button class="ghost inv-detail" data-id="${esc(i.id)}">Batafsil</button>
    <button class="ghost inv-reveal" data-id="${esc(i.id)}">Ko'rish</button>
    <button class="ghost danger inv-disable" data-id="${esc(i.id)}">Disable</button>
  </td></tr>`;
  }).join('')}</tbody></table>`;
}

async function loadBanners() {
  try {
    const data = await api('admin-banners');
    state.banners = data.banners || [];
    renderBanners();
  } catch { state.banners = []; }
}

async function loadPromos() {
  try {
    const data = await api('admin-promos');
    state.promos = data.promos || [];
    renderPromos();
  } catch { state.promos = []; }
}

async function loadReviews() {
  try {
    const data = await api('admin-reviews');
    state.reviews = data.reviews || [];
    renderReviews();
  } catch { state.reviews = []; }
}

async function loadFaq() {
  try {
    const data = await api('admin-faq');
    state.faq = data.items || [];
    renderFaq();
  } catch { state.faq = []; }
}

// --- Leadlar (saytdagi forma) ---
function renderLeads() {
  const root = document.getElementById('leadsList');
  if (!root) return;
  const badge = document.getElementById('leadsNewBadge');
  const newCount = state.leads.filter((l) => l.status === 'new').length;
  if (badge) {
    badge.textContent = String(newCount);
    badge.hidden = newCount === 0;
  }
  if (!state.leads.length) {
    root.innerHTML = '<p class="hint">Hozircha lead yo\'q.</p>';
    return;
  }
  root.innerHTML = `<table><thead><tr><th>Izlayapti</th><th>Kontakt</th><th>Ism</th><th>Sana</th><th>Holat</th><th></th></tr></thead><tbody>${state.leads.map((l) => `
    <tr>
      <td>${esc(l.wanted)}</td>
      <td>${esc(l.contact)}</td>
      <td>${esc(l.name || '—')}</td>
      <td>${dt(l.created_at)}</td>
      <td><span class="badge">${l.status === 'done' ? 'Bajarildi' : 'Yangi'}</span></td>
      <td>
        ${l.status === 'done'
          ? `<button class="ghost lead-reopen" data-id="${l.id}">Qayta ochish</button>`
          : `<button class="ghost lead-done" data-id="${l.id}">Bajarildi</button>`}
        <button class="ghost danger lead-delete" data-id="${l.id}">Del</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

async function loadLeads() {
  try {
    const data = await api('admin-leads');
    state.leads = data.leads || [];
  } catch {
    state.leads = [];
  }
  renderLeads();
}

async function loadUsers() {
  try {
    const data = await api('admin-users');
    state.users = data.users || [];
    renderUsers();
  } catch { state.users = []; }
}

async function loadSettings() {
  const data = await api('admin-settings');
  state.settings = data.settings || {};
  document.getElementById('sellerCardNumber').value = state.settings.seller_card_number || '';
  document.getElementById('sellerDisplayName').value = state.settings.seller_display_name || '';
  document.getElementById('adminTelegramId').value = state.settings.admin_telegram_id || '';
  document.getElementById('supportLink').value = state.settings.support_link || '';
  document.getElementById('settingsCashbackEnabled').checked = Boolean(state.settings.cashback_enabled);
  document.getElementById('settingsCashbackPercent').value = state.settings.cashback_percent ?? '';
  document.getElementById('settingsReferralBonus').value = state.settings.referral_fixed_bonus ?? '';
  document.getElementById('settingsReferralPercent').value = state.settings.referral_percent ?? '';
  document.getElementById('settingsMinTopup').value = state.settings.min_topup ?? '';
  document.getElementById('welcomeText').value = state.settings.welcome_text || '';
  document.getElementById('contactText').value = state.settings.contact_text || '';
  document.getElementById('settingsGeneralTerms').value = state.settings.general_terms || '';
}

async function deleteItem(type, id) {
  if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return;
  await api('admin-data', { method: 'DELETE', body: JSON.stringify({ type, id }) });
  // Ilgari initApp() chaqirilardi — bitta o'chirish uchun 9 ta so'rov ketardi.
  // Kategoriya/reja o'zgarishi uchun loadData() yetarli.
  await loadData();
}

async function initApp() {
  document.getElementById('loginError').textContent = '';
  const session = await fetch('/api/admin-session');
  if (!session.ok) {
    document.body.classList.remove('authed');
    document.getElementById('loginView').hidden = false;
    document.getElementById('appView').hidden = true;
    return;
  }
  document.body.classList.add('authed');
  document.getElementById('loginView').hidden = true;
  document.getElementById('appView').hidden = false;
  await Promise.all([loadDashboard(), loadData(), loadSettings(), loadBanners(), loadPromos(), loadReviews(), loadFaq(), loadUsers(), loadLeads()]);
}

// --- Image upload helper ---
function setupImageUpload(fileInputId, urlInputId, previewId, uploadBtnId) {
  const fileInput = document.getElementById(fileInputId);
  const urlInput = document.getElementById(urlInputId);
  const preview = document.getElementById(previewId);
  const btn = document.getElementById(uploadBtnId);

  const row = urlInput?.closest('.image-upload-row');

  async function handleFile(file) {
    if (!file) return;
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const url = await uploadImage(file);
      urlInput.value = url;
      preview.src = url;
      preview.style.display = 'block';
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Yuklash';
      fileInput.value = '';
    }
  }

  btn?.addEventListener('click', () => fileInput.click());
  urlInput?.addEventListener('input', () => {
    if (urlInput.value) { preview.src = urlInput.value; preview.style.display = 'block'; }
    else { preview.style.display = 'none'; }
  });
  fileInput?.addEventListener('change', () => handleFile(fileInput.files[0]));

  // Drag-and-drop
  if (row) {
    ['dragover', 'dragenter'].forEach((ev) => row.addEventListener(ev, (e) => {
      e.preventDefault();
      row.classList.add('dragover');
    }));
    ['dragleave', 'dragend', 'drop'].forEach((ev) => row.addEventListener(ev, () => row.classList.remove('dragover')));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
  }
}

// Forma yuborishdagi xatolar ilgari jimgina yo'qolardi (unhandled rejection) —
// admin saqlanmaganini bilmay qolardi. Bu o'ram xatoni ko'rsatadi va ikki marta
// bosishdan saqlaydi.
function onSubmit(formId, handler) {
  document.getElementById(formId)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = event.currentTarget.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await handler(event);
    } catch (error) {
      alert(error.message || 'Xatolik yuz berdi');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// --- Login ---
document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('admin-login', { method: 'POST', body: JSON.stringify({ password: document.getElementById('password').value }) });
    document.getElementById('password').value = '';
    await initApp();
  } catch (error) {
    document.getElementById('loginError').textContent = error.message;
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  await api('admin-logout');
  await initApp();
});

document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => {
  switchView(button.dataset.view);
  const title = document.getElementById('topbarTitle');
  if (title) title.textContent = button.textContent.trim();
  closeSidebar();
}));
document.getElementById('newCategoryButton').addEventListener('click', () => fillCategoryForm());
document.getElementById('newPlanButton').addEventListener('click', () => fillPlanForm());
document.getElementById('categoryReset').addEventListener('click', () => fillCategoryForm());
document.getElementById('planReset').addEventListener('click', () => fillPlanForm());

// Categories
document.getElementById('categoriesList').addEventListener('click', (event) => {
  const editButton = event.target.closest('.edit-category');
  if (editButton) {
    const item = state.categories.find((entry) => entry.id === editButton.dataset.id);
    fillCategoryForm(item);
    return;
  }
  const deleteButton = event.target.closest('.delete-item');
  if (deleteButton) {
    deleteItem(deleteButton.dataset.type, deleteButton.dataset.id).catch((error) => alert(error.message));
  }
});

// Leadlar
document.getElementById('leadsRefresh')?.addEventListener('click', () => {
  loadLeads().catch(() => {});
});
document.getElementById('leadsList')?.addEventListener('click', async (event) => {
  const doneBtn = event.target.closest('.lead-done');
  const reopenBtn = event.target.closest('.lead-reopen');
  const deleteBtn = event.target.closest('.lead-delete');
  try {
    if (doneBtn) {
      await api('admin-leads', { method: 'POST', body: JSON.stringify({ action: 'done', id: doneBtn.dataset.id }) });
    } else if (reopenBtn) {
      await api('admin-leads', { method: 'POST', body: JSON.stringify({ action: 'reopen', id: reopenBtn.dataset.id }) });
    } else if (deleteBtn) {
      if (!confirm('Leadni o\'chirasizmi?')) return;
      await api('admin-leads', { method: 'POST', body: JSON.stringify({ action: 'delete', id: deleteBtn.dataset.id }) });
    } else {
      return;
    }
    await loadLeads();
  } catch (error) {
    alert(error.message);
  }
});

// Plans
document.getElementById('plansList').addEventListener('click', (event) => {
  const editButton = event.target.closest('.edit-plan');
  if (editButton) {
    const item = state.plans.find((entry) => entry.id === editButton.dataset.id);
    fillPlanForm(item);
    return;
  }
  const deleteButton = event.target.closest('.delete-item');
  if (deleteButton) {
    deleteItem(deleteButton.dataset.type, deleteButton.dataset.id).catch((error) => alert(error.message));
  }
});

onSubmit('categoryForm', async () => {
  const item = {
    id: document.getElementById('categoryId').value || undefined,
    name: document.getElementById('categoryName').value,
    slug: document.getElementById('categorySlug').value,
    button_label: document.getElementById('categoryButtonLabel').value,
    sort_order: Number(document.getElementById('categorySortOrder').value || 1),
    description: document.getElementById('categoryDescription').value,
    is_active: document.getElementById('categoryIsActive').checked,
  };
  await api('admin-data', { method: item.id ? 'PUT' : 'POST', body: JSON.stringify({ type: 'category', item }) });
  fillCategoryForm();
  await loadData();
});

onSubmit('planForm', async () => {
  const item = {
    id: document.getElementById('planId').value || undefined,
    category_id: document.getElementById('planCategoryId').value,
    parent_plan_id: document.getElementById('planParentPlanId').value || null,
    name: document.getElementById('planName').value,
    button_label: document.getElementById('planButtonLabel').value,
    price: Number(document.getElementById('planPrice').value || 0),
    old_price: document.getElementById('planOldPrice').value ? Number(document.getElementById('planOldPrice').value) : null,
    official_price: document.getElementById('planOfficialPrice').value ? Number(document.getElementById('planOfficialPrice').value) : null,
    is_popular: document.getElementById('planIsPopular').checked,
    tags: document.getElementById('planTags').value ? document.getElementById('planTags').value.split(',').map((t) => t.trim()).filter(Boolean) : [],
    delivery_type: document.getElementById('planDeliveryType').value,
    currency: document.getElementById('planCurrency').value,
    duration: document.getElementById('planDuration').value,
    sort_order: Number(document.getElementById('planSortOrder').value || 1),
    image_url: document.getElementById('planImageUrl').value || null,
    warranty_text: document.getElementById('planWarrantyText').value,
    rules_text: document.getElementById('planRulesText').value,
    description: document.getElementById('planDescription').value,
    how_it_works_text: document.getElementById('planHowItWorksText').value,
    payment_instructions: document.getElementById('planPaymentInstructions').value,
    delivery_instructions: document.getElementById('planDeliveryInstructions').value,
    is_active: document.getElementById('planIsActive').checked,
  };
  await api('admin-data', { method: item.id ? 'PUT' : 'POST', body: JSON.stringify({ type: 'plan', item }) });
  fillPlanForm();
  await loadData();
});

// Settings
onSubmit('settingsForm', async () => {
  await api('admin-settings', {
    method: 'PUT',
    body: JSON.stringify({
      seller_card_number: document.getElementById('sellerCardNumber').value,
      seller_display_name: document.getElementById('sellerDisplayName').value,
      admin_telegram_id: document.getElementById('adminTelegramId').value,
      support_link: document.getElementById('supportLink').value,
      cashback_enabled: document.getElementById('settingsCashbackEnabled').checked,
      cashback_percent: document.getElementById('settingsCashbackPercent').value ? Number(document.getElementById('settingsCashbackPercent').value) : null,
      referral_fixed_bonus: document.getElementById('settingsReferralBonus').value ? Number(document.getElementById('settingsReferralBonus').value) : null,
      referral_percent: document.getElementById('settingsReferralPercent').value ? Number(document.getElementById('settingsReferralPercent').value) : null,
      min_topup: document.getElementById('settingsMinTopup').value ? Number(document.getElementById('settingsMinTopup').value) : null,
      welcome_text: document.getElementById('welcomeText').value,
      contact_text: document.getElementById('contactText').value,
      general_terms: document.getElementById('settingsGeneralTerms').value,
    }),
  });
  await loadSettings();
});

// --- Banners ---
document.getElementById('newBannerButton')?.addEventListener('click', () => fillBannerForm());
document.getElementById('bannerReset')?.addEventListener('click', () => fillBannerForm());
onSubmit('bannerForm', async () => {
  const item = {
    id: document.getElementById('bannerId').value || undefined,
    title: document.getElementById('bannerTitle').value,
    subtitle: document.getElementById('bannerSubtitle').value || null,
    btn_text: document.getElementById('bannerBtnText').value || null,
    link: document.getElementById('bannerLink').value || null,
    gradient: document.getElementById('bannerGradient').value || null,
    image_url: document.getElementById('bannerImageUrl').value || null,
    sort_order: Number(document.getElementById('bannerSortOrder').value || 1),
    is_active: document.getElementById('bannerIsActive').checked,
  };
  await api('admin-banners', { method: item.id ? 'PUT' : 'POST', body: JSON.stringify(item) });
  fillBannerForm();
  await loadBanners();
});
document.getElementById('bannersList')?.addEventListener('click', async (event) => {
  const editBtn = event.target.closest('.edit-banner');
  if (editBtn) {
    fillBannerForm(state.banners.find((b) => b.id === editBtn.dataset.id));
    return;
  }
  const delBtn = event.target.closest('.delete-banner');
  if (delBtn && confirm('Banner o\'chirilsinmi?')) {
    await api('admin-banners', { method: 'DELETE', body: JSON.stringify({ id: delBtn.dataset.id }) });
    await loadBanners();
  }
});

// --- Promos ---
document.getElementById('newPromoButton')?.addEventListener('click', () => fillPromoForm());
document.getElementById('promoReset')?.addEventListener('click', () => fillPromoForm());
document.getElementById('promoForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const item = {
    id: document.getElementById('promoId').value || undefined,
    code: document.getElementById('promoCode').value,
    discount_type: document.getElementById('promoDiscountType').value,
    discount_value: Number(document.getElementById('promoDiscountValue').value || 0),
    min_order_amount: Number(document.getElementById('promoMinOrder').value || 0),
    max_uses: document.getElementById('promoMaxUses').value ? Number(document.getElementById('promoMaxUses').value) : null,
    expires_at: document.getElementById('promoExpiresAt').value || null,
    is_one_time: document.getElementById('promoIsOneTime').checked,
    is_active: document.getElementById('promoIsActive').checked,
  };
  try {
    await api('admin-promos', { method: item.id ? 'PUT' : 'POST', body: JSON.stringify(item) });
    fillPromoForm();
    await loadPromos();
  } catch (err) { alert(err.message); }
});
document.getElementById('promosList')?.addEventListener('click', async (event) => {
  const usageBtn = event.target.closest('.promo-usage');
  if (usageBtn) {
    openPromoUsage(usageBtn.dataset.code).catch((e) => alert(e.message));
    return;
  }
  const editBtn = event.target.closest('.edit-promo');
  if (editBtn) {
    fillPromoForm(state.promos.find((p) => p.id === editBtn.dataset.id));
    return;
  }
  const delBtn = event.target.closest('.delete-promo');
  if (delBtn && confirm('Promokod o\'chirilsinmi?')) {
    await api('admin-promos', { method: 'DELETE', body: JSON.stringify({ id: delBtn.dataset.id }) });
    await loadPromos();
  }
});

// --- Reviews ---
document.getElementById('reloadReviewsButton')?.addEventListener('click', () => loadReviews());
document.getElementById('reviewStatusFilter')?.addEventListener('change', () => renderReviews());
document.getElementById('reviewsList')?.addEventListener('click', async (event) => {
  const btn = event.target.closest('.review-action');
  if (!btn) return;
  await api('admin-reviews', { method: 'POST', body: JSON.stringify({ action: btn.dataset.action, id: btn.dataset.id }) });
  await loadReviews();
});

// --- FAQ ---
document.getElementById('newFaqButton')?.addEventListener('click', () => fillFaqForm());
document.getElementById('faqReset')?.addEventListener('click', () => fillFaqForm());
onSubmit('faqForm', async () => {
  const item = {
    id: document.getElementById('faqId').value || undefined,
    question: document.getElementById('faqQuestion').value,
    answer: document.getElementById('faqAnswer').value,
    sort_order: Number(document.getElementById('faqSortOrder').value || 1),
    is_active: document.getElementById('faqIsActive').checked,
  };
  await api('admin-faq', { method: item.id ? 'PUT' : 'POST', body: JSON.stringify(item) });
  fillFaqForm();
  await loadFaq();
});
document.getElementById('faqList')?.addEventListener('click', async (event) => {
  const editBtn = event.target.closest('.edit-faq');
  if (editBtn) {
    fillFaqForm(state.faq.find((f) => f.id === editBtn.dataset.id));
    return;
  }
  const delBtn = event.target.closest('.delete-faq');
  if (delBtn && confirm('Savol o\'chirilsinmi?')) {
    await api('admin-faq', { method: 'DELETE', body: JSON.stringify({ id: delBtn.dataset.id }) });
    await loadFaq();
  }
  const moveBtn = event.target.closest('.faq-move');
  if (moveBtn) {
    await api('admin-faq', { method: 'POST', body: JSON.stringify({ action: 'reorder', id: moveBtn.dataset.id, dir: moveBtn.dataset.dir }) });
    await loadFaq();
  }
});

// --- Users ---
document.getElementById('reloadUsersButton')?.addEventListener('click', () => loadUsers());
document.getElementById('userSearch')?.addEventListener('input', (e) => {
  state.usersShown = 100; // yangi qidiruvda ro'yxat boshidan boshlansin
  renderUsers(e.target.value);
});
document.getElementById('usersLoadMore')?.addEventListener('click', () => {
  state.usersShown += 100;
  renderUsers(document.getElementById('userSearch')?.value || '');
});
document.getElementById('usersList')?.addEventListener('click', async (event) => {
  const detailBtn = event.target.closest('.user-detail');
  if (detailBtn) {
    openUserModal(detailBtn.dataset.id).catch((e) => alert(e.message));
    return;
  }
  const actionBtn = event.target.closest('.user-action');
  if (actionBtn) {
    await api('admin-users', { method: 'POST', body: JSON.stringify({ action: actionBtn.dataset.action, telegram_id: actionBtn.dataset.id }) });
    await loadUsers();
    return;
  }
  const msgBtn = event.target.closest('.user-msg');
  if (msgBtn) {
    switchView('messages');
    document.getElementById('messageType').value = 'individual';
    document.getElementById('messageTelegramId').value = msgBtn.dataset.id;
    document.getElementById('messageTelegramIdLabel').hidden = false;
  }
});

// --- Foydalanuvchi tafsilotlari modali (FIX 6): balans + xaridlar + balans tarixi ---
let currentUserId = null;
const PURCHASE_STATUS = { completed: 'Tasdiqlangan', approved: 'Tasdiqlangan', payment_detected: 'Kutilmoqda', delivering: 'Yetkazilmoqda', waiting_payment: 'Kutilmoqda', pending_payment: 'Kutilmoqda', payment_uploaded: 'Tekshirilmoqda', checking: 'Tekshirilmoqda', rejected: 'Bekor qilingan', expired: 'Muddat tugagan', cancelled: 'Bekor qilingan', failed: 'Xato' };

function renderUserDetail(data) {
  document.getElementById('userBalance').textContent = Number(data.balance || 0).toLocaleString('uz-UZ');
  const purchases = data.purchases || [];
  document.getElementById('userPurchases').innerHTML = purchases.length
    ? `<table><thead><tr><th>Sana</th><th>№</th><th>Obuna</th><th>Narx</th><th>Status</th><th>Promo</th></tr></thead><tbody>${purchases.map((p) => `<tr><td>${dt(p.created_at)}</td><td>${esc(p.order_number || '-')}</td><td>${esc(p.plan_name)}</td><td>${money(p.amount)}</td><td><span class="badge">${esc(PURCHASE_STATUS[p.status] || p.status)}</span></td><td>${esc(p.promo_code || '-')}</td></tr>`).join('')}</tbody></table>`
    : '<p style="padding:10px">Xaridlar yo\'q</p>';
  const hist = data.balanceHistory || [];
  document.getElementById('userBalanceHistory').innerHTML = hist.length
    ? `<table><thead><tr><th>Sana</th><th>Tur</th><th>Summa</th><th>Izoh</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${dt(h.created_at)}</td><td>${esc(h.type)}</td><td>${money(h.amount)}</td><td>${esc(h.description || '-')}</td></tr>`).join('')}</tbody></table>`
    : '<p style="padding:10px">Balans tarixi yo\'q</p>';
}

async function openUserModal(userId) {
  currentUserId = userId;
  document.getElementById('userModalTitle').textContent = `Foydalanuvchi ${userId}`;
  document.getElementById('balanceMsg').textContent = '';
  document.getElementById('balanceAmount').value = '';
  document.getElementById('balanceReason').value = '';
  document.getElementById('userPurchases').innerHTML = '';
  document.getElementById('userBalanceHistory').innerHTML = '';
  document.getElementById('userModal').hidden = false;
  renderUserDetail(await api(`admin-users?user_id=${encodeURIComponent(userId)}`));
}

async function adjustBalance(direction) {
  if (!currentUserId) return;
  const msg = document.getElementById('balanceMsg');
  const amount = Number(document.getElementById('balanceAmount').value || 0);
  if (!(amount > 0)) { msg.style.color = 'var(--danger)'; msg.textContent = 'Summa kiriting'; return; }
  const reason = document.getElementById('balanceReason').value;
  try {
    const res = await api('admin-users', { method: 'POST', body: JSON.stringify({ action: 'adjust-balance', telegram_id: currentUserId, amount, direction, reason }) });
    msg.style.color = 'var(--success, #16a34a)';
    msg.textContent = `Yangi balans: ${Number(res.balance || 0).toLocaleString('uz-UZ')} UZS`;
    document.getElementById('balanceAmount').value = '';
    document.getElementById('balanceReason').value = '';
    renderUserDetail(await api(`admin-users?user_id=${encodeURIComponent(currentUserId)}`));
    await loadUsers();
  } catch (e) {
    msg.style.color = 'var(--danger)';
    msg.textContent = e.message;
  }
}

document.getElementById('userModalClose')?.addEventListener('click', () => { document.getElementById('userModal').hidden = true; });
document.getElementById('userModal')?.addEventListener('click', (e) => { if (e.target.id === 'userModal') document.getElementById('userModal').hidden = true; });
document.getElementById('balanceAdd')?.addEventListener('click', () => adjustBalance('add'));
document.getElementById('balanceSub')?.addEventListener('click', () => adjustBalance('subtract'));

// --- Umumiy modal yopish: ✕ tugmasi, fon bosilishi va Escape ---
function bindModal(modalId, closeId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const close = () => { modal.hidden = true; };
  document.getElementById(closeId)?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
bindModal('promoUsageModal', 'promoUsageClose');
bindModal('invDetailModal', 'invDetailClose');
bindModal('orderDetailModal', 'orderDetailClose');
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  ['userModal', 'promoUsageModal', 'invDetailModal', 'orderDetailModal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.hidden) el.hidden = true;
  });
});

// --- Promokod batafsil: kim, qancha to'lab ishlatgan ---
const PROMO_PAID_HINT = 'Jamlanmaga faqat to\'langan buyurtmalar (approved/completed) kiradi.';

async function openPromoUsage(code) {
  const modal = document.getElementById('promoUsageModal');
  document.getElementById('promoUsageTitle').textContent = `Promokod: ${code}`;
  document.getElementById('promoUsageSummary').innerHTML = '';
  document.getElementById('promoUsageList').innerHTML = '<p class="detail-empty">Yuklanmoqda…</p>';
  modal.hidden = false;

  try {
    const data = await api(`admin-promos?usage=${encodeURIComponent(code)}`);
    const sum = data.summary || { total: 0, paid: 0, revenue: 0, discount_total: 0, unique_users: 0 };
    document.getElementById('promoUsageSummary').innerHTML = [
      cell('Jami ishlatilgan', `${sum.total} marta`),
      cell('To\'langan', `${sum.paid} ta`),
      cell('Tushum', `${money(sum.revenue)} UZS`),
      cell('Berilgan chegirma', `${money(sum.discount_total)} UZS`),
      cell('Turli mijoz', `${sum.unique_users} ta`),
    ].join('');

    const rows = data.orders || [];
    document.getElementById('promoUsageList').innerHTML = rows.length
      ? `<div class="table-card"><table><thead><tr><th>Sana</th><th>№</th><th>Mijoz</th><th>Obuna</th><th>To'lagan</th><th>Chegirma</th><th>Status</th></tr></thead><tbody>${rows.map((o) => `
        <tr>
          <td>${dt(o.created_at)}</td>
          <td>${esc(o.order_number)}</td>
          <td>${esc(userLabel(o))}${o.username ? ` <span class="hint">(${esc(o.user_telegram_id)})</span>` : ''}</td>
          <td>${esc(o.plan_name)}</td>
          <td>${money(o.amount)}</td>
          <td>${Number(o.discount_amount || 0) > 0 ? `−${money(o.discount_amount)}` : '-'}</td>
          <td><span class="badge">${esc(PURCHASE_STATUS[o.status] || o.status)}</span></td>
        </tr>`).join('')}</tbody></table></div><p class="hint">${esc(PROMO_PAID_HINT)}</p>`
      : '<p class="detail-empty">Bu promokod hali ishlatilmagan.</p>';
  } catch (error) {
    document.getElementById('promoUsageList').innerHTML = `<p class="detail-empty">${esc(error.message || 'Yuklanmadi')}</p>`;
  }
}

// --- Inventar birligi batafsil: akkaunt kimga va qachon ketgan ---
async function openInvDetail(id) {
  const modal = document.getElementById('invDetailModal');
  const body = document.getElementById('invDetailBody');
  body.innerHTML = '<p class="detail-empty">Yuklanmoqda…</p>';
  modal.hidden = false;

  try {
    const { detail: d } = await api('admin-inventory', {
      method: 'POST',
      body: JSON.stringify({ action: 'detail', id }),
    });
    document.getElementById('invDetailTitle').textContent = `${d.type === 'license_key' ? 'Kalit' : 'Akkaunt'} — ${d.status}`;

    const who = d.user
      ? [
        cell('Kimga ketgan', userLabel(d.user)),
        cell('Telegram ID', d.user.telegram_id),
        cell('Ism', d.user.full_name || '—'),
      ].join('')
      : '';

    const order = d.order
      ? [
        cell('Buyurtma №', d.order.order_number),
        cell('Buyurtma holati', PURCHASE_STATUS[d.order.status] || d.order.status),
        cell('To\'langan', `${money(d.order.amount)} UZS`),
        cell('Promokod', d.order.promo_code || '—'),
      ].join('')
      : '';

    body.innerHTML = `
      <div class="detail-grid">
        ${cell('Reja', d.plan_name || '—')}
        ${cell('Turi', d.type)}
        ${cell('Holat', d.status)}
        ${cell('Login', d.login_masked || '—')}
      </div>
      <h4>Kimga ketgan</h4>
      ${d.user ? `<div class="detail-grid">${who}</div>` : '<p class="detail-empty">Hali hech kimga biriktirilmagan.</p>'}
      <h4>Buyurtma</h4>
      ${d.order ? `<div class="detail-grid">${order}</div>` : '<p class="detail-empty">Bog\'langan buyurtma yo\'q.</p>'}
      <h4>Vaqt chizig'i</h4>
      <div class="detail-grid">
        ${cell('Qo\'shilgan', dt(d.created_at))}
        ${cell('Band qilingan', dt(d.reserved_at))}
        ${cell('Yetkazilgan', dt(d.delivered_at))}
        ${cell('Sotilgan', dt(d.sold_at))}
      </div>
      ${d.notes ? `<h4>Izoh</h4><p>${esc(d.notes)}</p>` : ''}`;
  } catch (error) {
    body.innerHTML = `<p class="detail-empty">${esc(error.message || 'Yuklanmadi')}</p>`;
  }
}

// --- Buyurtma batafsil: pul taqsimoti, yetkazilgan akkaunt, vaqt chizig'i ---
async function openOrderDetail(id) {
  const modal = document.getElementById('orderDetailModal');
  const body = document.getElementById('orderDetailBody');
  body.innerHTML = '<p class="detail-empty">Yuklanmoqda…</p>';
  modal.hidden = false;

  try {
    const { detail: d } = await api(`admin-orders?order_id=${encodeURIComponent(id)}`);
    document.getElementById('orderDetailTitle').textContent = `Buyurtma ${d.order_number}`;

    const items = d.delivery.items || [];
    const delivered = items.length
      ? `<div class="table-card"><table><thead><tr><th>Turi</th><th>Login</th><th>Holat</th><th>Yetkazilgan</th><th>Sotilgan</th></tr></thead><tbody>${items.map((i) => `
        <tr>
          <td>${esc(i.type)}</td>
          <td>${esc(i.login_masked || '—')}</td>
          <td>${esc(i.status)}</td>
          <td>${dt(i.delivered_at)}</td>
          <td>${dt(i.sold_at)}</td>
        </tr>`).join('')}</tbody></table></div>
        <p class="hint">Login/parolni to'liq ko'rish uchun Inventory bo'limidagi "Ko'rish" tugmasidan foydalaning.</p>`
      : '<p class="detail-empty">Bu buyurtmaga akkaunt biriktirilmagan.</p>';

    body.innerHTML = `
      <div class="detail-grid">
        ${cell('Mijoz', userLabel(d.user))}
        ${cell('Telegram ID', d.user.telegram_id)}
        ${cell('Obuna', d.plan_name)}
        ${cell('Holat', PURCHASE_STATUS[d.status] || d.status)}
      </div>
      <h4>To'lov</h4>
      <div class="detail-grid">
        ${cell('To\'langan summa', `${money(d.money.amount)} UZS`)}
        ${cell('Promokod', d.money.promo_code || '—')}
        ${cell('Chegirma', `${money(d.money.discount_amount)} UZS`)}
        ${cell('Balansdan', `${money(d.money.balance_used)} UZS`)}
        ${cell('Cashback', `${money(d.money.cashback_amount)} UZS`)}
        ${cell('To\'lov usuli', d.money.payment_method || '—')}
      </div>
      <h4>Yetkazilgan akkaunt</h4>
      ${delivered}
      ${d.delivery.error ? `<p class="detail-empty">Yetkazishda xato: ${esc(d.delivery.error)} (${esc(d.delivery.attempts)} urinish)</p>` : ''}
      <h4>Vaqt chizig'i</h4>
      <div class="detail-grid">
        ${cell('Yaratilgan', dt(d.timeline.created_at))}
        ${cell('Chek yuklangan', dt(d.timeline.receipt_uploaded_at))}
        ${cell('To\'langan', dt(d.timeline.paid_at))}
        ${cell('Tasdiqlangan', dt(d.timeline.approved_at))}
        ${cell('Yetkazilgan', dt(d.timeline.delivered_at))}
        ${cell('Yakunlangan', dt(d.timeline.completed_at))}
      </div>
      ${d.admin_comment ? `<h4>Admin izohi</h4><p>${esc(d.admin_comment)}</p>` : ''}`;
  } catch (error) {
    body.innerHTML = `<p class="detail-empty">${esc(error.message || 'Yuklanmadi')}</p>`;
  }
}

// --- Messages ---
document.getElementById('messageType')?.addEventListener('change', (e) => {
  document.getElementById('messageTelegramIdLabel').hidden = e.target.value === 'broadcast';
});
document.getElementById('messageForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const type = document.getElementById('messageType').value;
  const text = document.getElementById('messageText').value;
  const telegramId = document.getElementById('messageTelegramId').value;
  if (type === 'individual' && !telegramId) { alert('Telegram ID kiriting'); return; }
  const result = document.getElementById('messageResult');
  result.textContent = 'Yuborilmoqda...';
  try {
    const res = await api('admin-messages', { method: 'POST', body: JSON.stringify({ type, text, telegram_id: telegramId }) });
    result.textContent = res.message || 'Yuborildi!';
    document.getElementById('messageText').value = '';
  } catch (err) {
    result.textContent = err.message;
    result.style.color = 'var(--danger)';
  }
});

// --- Orders ---
document.getElementById('reloadOrdersButton')?.addEventListener('click', () => loadOrders().catch((e) => alert(e.message)));
document.getElementById('orderStatusFilter')?.addEventListener('change', () => loadOrders().catch((e) => alert(e.message)));
document.getElementById('ordersLoadMore')?.addEventListener('click', () => loadOrders({ append: true }).catch((e) => alert(e.message)));

// Qidiruv har bosilgan harfda so'rov yubormasin — 350ms kutadi.
let orderSearchTimer = null;
document.getElementById('orderSearch')?.addEventListener('input', () => {
  clearTimeout(orderSearchTimer);
  orderSearchTimer = setTimeout(() => loadOrders().catch((e) => alert(e.message)), 350);
});
document.getElementById('exportOrdersCsv')?.addEventListener('click', () => {
  const header = ['№', 'User', 'Reja', 'Summa', 'Promo', 'Chegirma', 'Balansdan', 'Cashback', 'Status', 'Delivery', 'Vaqt'];
  const rows = [header, ...state.orders.map((o) => [
    o.order_number, o.user_telegram_id, o.plan_name || '-',
    o.unique_price ?? o.amount, o.promo_code || '', o.discount_amount || 0,
    o.balance_used || 0, o.cashback_amount || 0,
    o.status, o.delivery_status || '-',
    new Date(o.created_at).toLocaleString('uz-UZ'),
  ])];
  exportCsv('orders.csv', rows);
});
document.getElementById('ordersList')?.addEventListener('click', async (event) => {
  const detailBtn = event.target.closest('.order-detail');
  if (detailBtn) {
    openOrderDetail(detailBtn.dataset.id).catch((e) => alert(e.message));
    return;
  }
  const btn = event.target.closest('.order-action');
  if (!btn) return;
  const res = await api('admin-orders', { method: 'POST', body: JSON.stringify({ action: btn.dataset.action, orderId: btn.dataset.id }) });
  if (res?.delivery?.admin_message) alert(`Delivery: ${res.delivery.admin_message}`);
  else if (res?.delivery?.message) alert(`Delivery: ${res.delivery.message}`);
  if (!res?.ok && res?.error) alert(res.error);
  await loadOrders();
  await loadDashboard();
});

// --- Inventory ---
document.getElementById('inventoryFilterForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadInventory().catch((e) => alert(e.message));
});
// Holat filtri allaqachon yuklangan ro'yxat ustida ishlaydi — qayta so'rov shart emas.
document.getElementById('inventoryStatusFilter')?.addEventListener('change', () => renderInventory());
onSubmit('inventoryForm', async () => {
  await api('admin-inventory', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: document.getElementById('inventoryPlanIdCreate').value,
      type: document.getElementById('inventoryType').value,
      login: document.getElementById('inventoryLogin').value || null,
      password: document.getElementById('inventoryPassword').value || null,
      license_key: document.getElementById('inventoryLicenseKey').value || null,
      notes: document.getElementById('inventoryNotes').value || null,
    }),
  });
  document.getElementById('inventoryPassword').value = '';
  document.getElementById('inventoryLicenseKey').value = '';
  await loadInventory();
});
document.getElementById('inventoryList')?.addEventListener('click', async (event) => {
  const detailBtn = event.target.closest('.inv-detail');
  if (detailBtn) {
    openInvDetail(detailBtn.dataset.id).catch((e) => alert(e.message));
    return;
  }
  // "Ko'rish" — maskalangan login/parol/kalit o'rniga haqiqiy qiymatlarni ochadi.
  // Qayta bosilsa ("Yashirish") ro'yxatdagi maskalangan holatga qaytaradi.
  const reveal = event.target.closest('.inv-reveal');
  if (reveal) {
    const row = reveal.closest('tr');
    const masked = state.inventory.find((i) => String(i.id) === String(reveal.dataset.id));
    if (reveal.dataset.open === '1') {
      row.querySelector('.inv-login').textContent = masked?.login || '-';
      row.querySelector('.inv-pass').textContent = masked?.password_encrypted || '-';
      row.querySelector('.inv-key').textContent = masked?.license_key_encrypted || '-';
      reveal.dataset.open = '';
      reveal.textContent = "Ko'rish";
      return;
    }
    reveal.disabled = true;
    try {
      const data = await api('admin-inventory', { method: 'POST', body: JSON.stringify({ action: 'reveal', id: reveal.dataset.id }) });
      const item = data.item || {};
      // textContent — kredensiallardagi maxsus belgilar HTML sifatida talqin qilinmasin
      row.querySelector('.inv-login').textContent = item.login || '-';
      row.querySelector('.inv-pass').textContent = item.password || '-';
      row.querySelector('.inv-key').textContent = item.license_key || '-';
      if (item.extra_data || item.notes) {
        row.title = [item.extra_data, item.notes].filter(Boolean).join('\n');
      }
      reveal.dataset.open = '1';
      reveal.textContent = 'Yashirish';
    } catch (error) {
      alert(error.message || "Ko'rsatib bo'lmadi");
    } finally {
      reveal.disabled = false;
    }
    return;
  }

  const btn = event.target.closest('.inv-disable');
  if (!btn) return;
  await api('admin-inventory', { method: 'POST', body: JSON.stringify({ action: 'disable', id: btn.dataset.id }) });
  await loadInventory();
});

// --- Image upload setup ---
setupImageUpload('planImageFile', 'planImageUrl', 'planImagePreview', 'planImageUploadBtn');
setupImageUpload('bannerImageFile', 'bannerImageUrl', 'bannerImagePreview', 'bannerImageUploadBtn');

// --- Responsive jadvallar: mobil (<768px) da qatorlar kartochkaga aylanadi ---
// Har bir <td> ga ustun sarlavhasini data-label qilib yozamiz (CSS ::before ishlatadi).
// app.js render funksiyalarini o'zgartirmasdan, har qanday qayta chizishdan keyin ishlaydi.
function labelizeTables() {
  document.querySelectorAll('.table-card table').forEach((table) => {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!heads.length) return;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (heads[i]) td.setAttribute('data-label', heads[i]);
      });
    });
  });
}
const contentEl = document.querySelector('.content');
if (contentEl) {
  new MutationObserver(() => window.requestAnimationFrame(labelizeTables)).observe(contentEl, { childList: true, subtree: true });
}

// --- Mobil sidebar (hamburger menu) ---
const sidebarEl = document.getElementById('sidebar');
const backdropEl = document.getElementById('sidebarBackdrop');
function closeSidebar() { sidebarEl?.classList.remove('open'); backdropEl?.classList.remove('show'); }
function openSidebar() { sidebarEl?.classList.add('open'); backdropEl?.classList.add('show'); }
document.getElementById('menuToggle')?.addEventListener('click', () => {
  if (sidebarEl?.classList.contains('open')) closeSidebar(); else openSidebar();
});
backdropEl?.addEventListener('click', closeSidebar);

// --- Yordam (Help) bo'limi: akkordeon ---
const HELP_ITEMS = [
  { icon: '📊', title: 'Dashboard', body: 'Umumiy statistika: foydalanuvchilar soni, buyurtmalar, tushum grafigi. Bu yerda hech narsa o’zgartirish mumkin emas, faqat ko’rish uchun.' },
  { icon: '🗂️', title: 'Kategoriyalar', body: 'Mahsulotlar guruhlari. Masalan "Video tahrirlash", "AI asboblar". Kategoriya qo’shsangiz katalogda filtr sifatida chiqadi. Tartib raqami kichik bo’lgani birinchi ko’rinadi.' },
  { icon: '📦', title: 'Rejalar (Mahsulotlar)', body: 'Sotiladigan obunalar. Har bir rejada: nomi, tavsifi, narxi, chegirma narxi, kategoriyasi, muddat (kunlarda), stok soni. Stok 0 bo’lsa "Tugagan" ko’rinadi. Rasm yuklash mumkin.' },
  { icon: '🔑', title: 'Inventory', body: 'Avtomatik yetkaziladigan rejalar uchun akkaunt/kalitlar zaxirasi. Har bir sotuvda bittasi avtomatik foydalanuvchiga yuboriladi. Zaxira kamayganda ogohlantirish keladi.' },
  { icon: '🖼️', title: 'Bannerlar', body: 'Katalog tepasida aylanadigan reklama bannerlari. Sarlavha, matn, tugma, havola va gradient yoki rasm qo’shish mumkin. Havola sifatida ichki action (topup, catalog) yoki tashqi URL yozish mumkin.' },
  { icon: '❓', title: 'FAQ', body: 'Profil sahifasida ko’rinadigan savol-javoblar. Savol va javob yozing, tartibini (↑/↓) belgilang.' },
  { icon: '🎟️', title: 'Promokodlar', body: 'Chegirma kodlari. Kod, chegirma turi (foiz/summa), qiymati, minimal buyurtma summasi, amal muddati. Foydalanuvchi checkout’da kiritadi.' },
  { icon: '⭐', title: 'Sharhlar', body: 'Foydalanuvchilar yozgan sharhlar. Tasdiqlash, rad etish yoki o’chirish mumkin. Faqat tasdiqlangan sharhlar mahsulotda ko’rinadi.' },
  { icon: '👥', title: 'Foydalanuvchilar', body: 'Ro’yxatdan o’tgan barcha foydalanuvchilar. Qidiruv, bloklash/blokdan chiqarish mumkin. Bloklangan foydalanuvchi botni ham, Mini App’ni ham ishlata olmaydi.' },
  { icon: '🛒', title: 'Buyurtmalar', body: 'Barcha xaridlar. Statuslar: kutilmoqda, tasdiqlangan, rad etilgan, tugallangan. Admin approve/reject qiladi. "Batafsil" tugmasi qaysi akkaunt kimga va qachon ketganini, promokod va chegirmani ko’rsatadi. Qidiruv buyurtma raqami yoki Telegram ID bo’yicha. CSV export mumkin.' },
  { icon: '💼', title: 'Vakansiyalar', body: 'Bepul ishchi/e’lon taxtasi. Yangi ishchi ro’yxatdan o’tsa tasdiqlash kerak. E’lonlarni ko’rish, arxivlash mumkin. Ishchi bilan bog’lanish tugmasi faqat u Telegram username qo’ygan bo’lsa ko’rinadi.' },
  { icon: '📥', title: 'Leadlar', body: 'Saytdagi "Izlagan obunangiz yo’qmi?" formasidan kelgan so’rovlar. Har biri adminga Telegram xabari sifatida ham keladi. Bajarilganini belgilash yoki o’chirish mumkin.' },
  { icon: '✉️', title: 'Xabar yuborish', body: 'Foydalanuvchilarga Telegram orqali xabar. Individual (bitta Telegram ID ga) yoki Broadcast (hammaga). Broadcast 25 talab parallel yuboriladi.' },
  { icon: '⚙️', title: 'Sozlamalar', body: 'Karta raqami, cashback foizi, referal bonus, min topup, welcome text, contact text, umumiy qoidalar. Bu yerda o’zgartirilgan narsa butun botga ta’sir qiladi.' },
];
function renderHelp() {
  const root = document.getElementById('helpAccordion');
  if (!root) return;
  root.innerHTML = HELP_ITEMS.map((h) => `
    <div class="accordion-item">
      <button type="button" class="accordion-header">
        <span class="accordion-title"><span class="accordion-ico">${h.icon}</span>${h.title}</span>
        <span class="accordion-caret">▸</span>
      </button>
      <div class="accordion-body">${h.body}</div>
    </div>`).join('');
}
document.getElementById('helpAccordion')?.addEventListener('click', (event) => {
  const header = event.target.closest('.accordion-header');
  if (!header) return;
  header.parentElement.classList.toggle('open');
});
renderHelp();

initApp().catch((error) => {
  document.getElementById('loginError').textContent = error.message;
});
