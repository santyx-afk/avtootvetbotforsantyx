const state = { categories: [], plans: [], settings: null, orders: [], inventory: [], banners: [], reviews: [], faq: [], users: [] };

const views = {
  dashboard: document.getElementById('dashboardView'),
  categories: document.getElementById('categoriesView'),
  plans: document.getElementById('plansView'),
  orders: document.getElementById('ordersView'),
  inventory: document.getElementById('inventoryView'),
  banners: document.getElementById('bannersView'),
  reviews: document.getElementById('reviewsView'),
  faq: document.getElementById('faqView'),
  users: document.getElementById('usersView'),
  messages: document.getElementById('messagesView'),
  settings: document.getElementById('settingsView'),
};

async function api(url, options = {}) {
  const response = await fetch(`/api/${url}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
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
  ];
  document.getElementById('statsCards').innerHTML = cards.map(([label, value]) => `<div class="card"><h3>${label}</h3><strong>${value}</strong></div>`).join('');
  document.getElementById('topCategories').innerHTML = stats.mostViewedCategories.map((item) => `<li>${item.name}: ${item.total}</li>`).join('') || '<li>Ma\'lumot yo\'q</li>';
  document.getElementById('topPlans').innerHTML = stats.mostViewedPlans.map((item) => `<li>${item.name}: ${item.total}</li>`).join('') || '<li>Ma\'lumot yo\'q</li>';
  document.getElementById('topPayments').innerHTML = stats.mostPaymentClicks.map((item) => `<li>${item.name}: ${item.total}</li>`).join('') || '<li>Ma\'lumot yo\'q</li>';
  document.getElementById('eventLogs').innerHTML = stats.eventLogs.map((item) => `<li><strong>${item.event_type}</strong> — ${new Date(item.created_at).toLocaleString('uz-UZ')}</li>`).join('') || '<li>Ma\'lumot yo\'q</li>';
}

function renderCategories() {
  const root = document.getElementById('categoriesList');
  root.innerHTML = `<table><thead><tr><th>Nomi</th><th>Slug</th><th>Tartib</th><th>Holat</th><th></th></tr></thead><tbody>${state.categories.map((item) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.slug}</td>
      <td>${item.sort_order}</td>
      <td><span class="badge">${item.is_active ? 'Faol' : 'NoFaol'}</span></td>
      <td>
        <button class="ghost edit-category" data-id="${item.id}">Edit</button>
        <button class="ghost danger delete-item" data-type="category" data-id="${item.id}">Delete</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  const categorySelect = document.getElementById('planCategoryId');
  categorySelect.innerHTML = state.categories.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
}

function renderPlans() {
  const root = document.getElementById('plansList');
  root.innerHTML = `<table><thead><tr><th>Nomi</th><th>Kategoriya</th><th>Narx</th><th>Rasm</th><th>Tartib</th><th></th></tr></thead><tbody>${state.plans.map((item) => `
    <tr>
      <td>${item.name}${item.is_popular ? ' ⭐' : ''}</td>
      <td>${state.categories.find((category) => category.id === item.category_id)?.name || '-'}</td>
      <td>${Number(item.price || 0).toLocaleString('uz-UZ')} ${item.currency}</td>
      <td>${item.image_url ? '<span class="badge">✓</span>' : '-'}</td>
      <td>${item.sort_order}</td>
      <td>
        <button class="ghost edit-plan" data-id="${item.id}">Edit</button>
        <button class="ghost danger delete-item" data-type="plan" data-id="${item.id}">Delete</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  const parentSelect = document.getElementById('planParentPlanId');
  parentSelect.innerHTML = `<option value="">Yo'q</option>${state.plans.filter((item) => !item.parent_plan_id).map((item) => `<option value="${item.id}">${item.name}</option>`).join('')}`;
  document.getElementById('inventoryPlanId').innerHTML = state.plans.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
  document.getElementById('inventoryPlanIdCreate').innerHTML = state.plans.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
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
      <td>${b.title}</td>
      <td>${b.image_url ? '<span class="badge">✓</span>' : '-'}</td>
      <td>${b.sort_order || 0}</td>
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

// --- Reviews ---
function renderReviews() {
  const root = document.getElementById('reviewsList');
  const statusFilter = document.getElementById('reviewStatusFilter')?.value || '';
  const filtered = statusFilter ? state.reviews.filter((r) => r.status === statusFilter) : state.reviews;
  root.innerHTML = `<table><thead><tr><th>Foydalanuvchi</th><th>Reja</th><th>Baho</th><th>Sharh</th><th>Holat</th><th></th></tr></thead><tbody>${filtered.map((r) => `
    <tr>
      <td>${r.user_telegram_id}</td>
      <td>${state.plans.find((p) => p.id === r.plan_id)?.name || r.plan_id}</td>
      <td class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
      <td>${r.comment || '-'}</td>
      <td><span class="badge">${r.status || 'pending'}</span></td>
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
      <td>${f.question}</td>
      <td>${f.sort_order || 0}</td>
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
  root.innerHTML = `<table><thead><tr><th>Telegram ID</th><th>Username</th><th>Ism</th><th>Telefon</th><th>Til</th><th>Blocked</th><th></th></tr></thead><tbody>${filtered.slice(0, 100).map((u) => `
    <tr>
      <td>${u.telegram_id}</td>
      <td>${u.username || '-'}</td>
      <td>${u.full_name || '-'}</td>
      <td>${u.phone || '-'}</td>
      <td>${u.language_code || '-'}</td>
      <td>${u.is_blocked ? '🚫' : '-'}</td>
      <td>
        <button class="ghost user-action" data-action="${u.is_blocked ? 'unblock' : 'block'}" data-id="${u.telegram_id}">${u.is_blocked ? 'Unblock' : 'Block'}</button>
        <button class="ghost user-msg" data-id="${u.telegram_id}">Xabar</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  if (filtered.length > 100) root.innerHTML += `<p>+${filtered.length - 100} ta yana...</p>`;
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

async function loadOrders() {
  const status = document.getElementById('orderStatusFilter')?.value || '';
  const data = await api(`admin-orders${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  state.orders = data.orders || [];
  const root = document.getElementById('ordersList');
  root.innerHTML = `<table><thead><tr><th>№</th><th>User</th><th>Reja</th><th>Summa</th><th>Status</th><th>Delivery</th><th>Vaqt</th><th>Amal</th></tr></thead><tbody>${state.orders.map((o) => {
  const canApprove = ['payment_uploaded', 'checking'].includes(o.status);
  const isProcessed = ['approved', 'rejected', 'completed', 'cancelled'].includes(o.status);
  return `
  <tr><td>${o.order_number}</td><td>${o.user_telegram_id}</td><td>${o.plan_name || '-'}</td><td>${Number(o.amount || 0).toLocaleString('uz-UZ')}</td><td>${o.status}</td><td>${o.delivery_status || '-'}</td><td>${new Date(o.created_at).toLocaleString('uz-UZ')}</td>
  <td>
    <button class="ghost order-action" data-action="approve" data-id="${o.id}" ${canApprove ? '' : 'disabled'}>Approve</button>
    <button class="ghost danger order-action" data-action="reject" data-id="${o.id}" ${isProcessed ? 'disabled' : ''}>Reject</button>
    <button class="ghost order-action" data-action="retry_delivery" data-id="${o.id}">Retry</button>
    <button class="ghost order-action" data-action="complete" data-id="${o.id}">Complete</button>
  </td></tr>`;}).join('')}</tbody></table>`;
}

async function loadInventory() {
  const planId = document.getElementById('inventoryPlanId')?.value;
  if (!planId) return;
  const data = await api(`admin-inventory?plan_id=${encodeURIComponent(planId)}`);
  state.inventory = data.items || [];
  const c = data.counts || {};
  document.getElementById('inventoryCounts').innerHTML = `available:${c.available || 0}, reserved:${c.reserved || 0}, delivered:${c.delivered || 0}, sold:${c.sold || 0}, disabled:${c.disabled || 0}`;
  document.getElementById('inventoryList').innerHTML = `<table><thead><tr><th>Type</th><th>Login</th><th>Password</th><th>Key</th><th>Status</th><th></th></tr></thead><tbody>${state.inventory.map((i) => `<tr>
  <td>${i.type}</td><td>${i.login || '-'}</td><td>${i.password_encrypted || '-'}</td><td>${i.license_key_encrypted || '-'}</td><td>${i.status}</td>
  <td><button class="ghost danger inv-disable" data-id="${i.id}">Disable</button></td></tr>`).join('')}</tbody></table>`;
}

async function loadBanners() {
  try {
    const data = await api('admin-banners');
    state.banners = data.banners || [];
    renderBanners();
  } catch { state.banners = []; }
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
  document.getElementById('settingsCashbackPercent').value = state.settings.cashback_percent ?? '';
  document.getElementById('settingsReferralBonus').value = state.settings.referral_bonus ?? '';
  document.getElementById('settingsReferralPercent').value = state.settings.referral_percent ?? '';
  document.getElementById('settingsMinTopup').value = state.settings.min_topup ?? '';
  document.getElementById('welcomeText').value = state.settings.welcome_text || '';
  document.getElementById('contactText').value = state.settings.contact_text || '';
  document.getElementById('settingsGeneralTerms').value = state.settings.general_terms || '';
}

async function deleteItem(type, id) {
  if (!confirm('Rostdan ham o\'chirmoqchimisiz?')) return;
  await api('admin-data', { method: 'DELETE', body: JSON.stringify({ type, id }) });
  await initApp();
}

async function initApp() {
  document.getElementById('loginError').textContent = '';
  const session = await fetch('/api/admin-session');
  if (!session.ok) {
    document.getElementById('loginView').hidden = false;
    document.getElementById('appView').hidden = true;
    return;
  }
  document.getElementById('loginView').hidden = true;
  document.getElementById('appView').hidden = false;
  await Promise.all([loadDashboard(), loadData(), loadSettings(), loadBanners(), loadReviews(), loadFaq(), loadUsers()]);
}

// --- Image upload helper ---
function setupImageUpload(fileInputId, urlInputId, previewId, uploadBtnId) {
  const fileInput = document.getElementById(fileInputId);
  const urlInput = document.getElementById(urlInputId);
  const preview = document.getElementById(previewId);
  const btn = document.getElementById(uploadBtnId);

  btn?.addEventListener('click', () => fileInput.click());
  urlInput?.addEventListener('input', () => {
    if (urlInput.value) { preview.src = urlInput.value; preview.style.display = 'block'; }
    else { preview.style.display = 'none'; }
  });
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files[0];
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

document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
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

document.getElementById('categoryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
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
  await initApp();
});

document.getElementById('planForm').addEventListener('submit', async (event) => {
  event.preventDefault();
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
  await initApp();
});

// Settings
document.getElementById('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await api('admin-settings', {
    method: 'PUT',
    body: JSON.stringify({
      seller_card_number: document.getElementById('sellerCardNumber').value,
      seller_display_name: document.getElementById('sellerDisplayName').value,
      admin_telegram_id: document.getElementById('adminTelegramId').value,
      support_link: document.getElementById('supportLink').value,
      cashback_percent: document.getElementById('settingsCashbackPercent').value ? Number(document.getElementById('settingsCashbackPercent').value) : null,
      referral_bonus: document.getElementById('settingsReferralBonus').value ? Number(document.getElementById('settingsReferralBonus').value) : null,
      referral_percent: document.getElementById('settingsReferralPercent').value ? Number(document.getElementById('settingsReferralPercent').value) : null,
      min_topup: document.getElementById('settingsMinTopup').value ? Number(document.getElementById('settingsMinTopup').value) : null,
      welcome_text: document.getElementById('welcomeText').value,
      contact_text: document.getElementById('contactText').value,
      general_terms: document.getElementById('settingsGeneralTerms').value,
    }),
  });
  await initApp();
});

// --- Banners ---
document.getElementById('newBannerButton')?.addEventListener('click', () => fillBannerForm());
document.getElementById('bannerReset')?.addEventListener('click', () => fillBannerForm());
document.getElementById('bannerForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
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
document.getElementById('faqForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
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
document.getElementById('userSearch')?.addEventListener('input', (e) => renderUsers(e.target.value));
document.getElementById('usersList')?.addEventListener('click', async (event) => {
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
document.getElementById('ordersList')?.addEventListener('click', async (event) => {
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
document.getElementById('inventoryFilterForm')?.addEventListener('submit', async (event) => { event.preventDefault(); await loadInventory(); });
document.getElementById('inventoryForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
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
  const btn = event.target.closest('.inv-disable');
  if (!btn) return;
  await api('admin-inventory', { method: 'POST', body: JSON.stringify({ action: 'disable', id: btn.dataset.id }) });
  await loadInventory();
});

// --- Image upload setup ---
setupImageUpload('planImageFile', 'planImageUrl', 'planImagePreview', 'planImageUploadBtn');
setupImageUpload('bannerImageFile', 'bannerImageUrl', 'bannerImagePreview', 'bannerImageUploadBtn');

initApp().catch((error) => {
  document.getElementById('loginError').textContent = error.message;
});
