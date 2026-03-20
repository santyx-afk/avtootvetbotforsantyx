const state = { categories: [], plans: [], settings: null };

const views = {
  dashboard: document.getElementById('dashboardView'),
  categories: document.getElementById('categoriesView'),
  plans: document.getElementById('plansView'),
  settings: document.getElementById('settingsView'),
};

async function api(url, options = {}) {
  const response = await fetch(`/api/${url}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || 'So‘rovda xatolik');
  return data;
}

function switchView(name) {
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  Object.entries(views).forEach(([key, element]) => {
    element.hidden = key !== name;
  });
}

function renderStats(stats) {
  const cards = [
    ['Jami foydalanuvchi', stats.totalUsers],
    ['Jami kliklar', stats.totalClicks],
    ['To‘lov sahifasi ochilishi', stats.totalPaymentOpens],
  ];
  document.getElementById('statsCards').innerHTML = cards.map(([label, value]) => `<div class="card"><h3>${label}</h3><strong>${value}</strong></div>`).join('');
  document.getElementById('topCategories').innerHTML = stats.mostViewedCategories.map((item) => `<li>${item.name}: ${item.total}</li>`).join('') || '<li>Ma’lumot yo‘q</li>';
  document.getElementById('topPlans').innerHTML = stats.mostViewedPlans.map((item) => `<li>${item.name}: ${item.total}</li>`).join('') || '<li>Ma’lumot yo‘q</li>';
  document.getElementById('topPayments').innerHTML = stats.mostPaymentClicks.map((item) => `<li>${item.name}: ${item.total}</li>`).join('') || '<li>Ma’lumot yo‘q</li>';
  document.getElementById('eventLogs').innerHTML = stats.eventLogs.map((item) => `<li><strong>${item.event_type}</strong> — ${new Date(item.created_at).toLocaleString('uz-UZ')}</li>`).join('') || '<li>Ma’lumot yo‘q</li>';
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
  root.innerHTML = `<table><thead><tr><th>Nomi</th><th>Kategoriya</th><th>Narx</th><th>Tartib</th><th></th></tr></thead><tbody>${state.plans.map((item) => `
    <tr>
      <td>${item.name}</td>
      <td>${state.categories.find((category) => category.id === item.category_id)?.name || '-'}</td>
      <td>${Number(item.price || 0).toLocaleString('uz-UZ')} ${item.currency}</td>
      <td>${item.sort_order}</td>
      <td>
        <button class="ghost edit-plan" data-id="${item.id}">Edit</button>
        <button class="ghost danger delete-item" data-type="plan" data-id="${item.id}">Delete</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  const parentSelect = document.getElementById('planParentPlanId');
  parentSelect.innerHTML = `<option value="">Yo‘q</option>${state.plans.filter((item) => !item.parent_plan_id).map((item) => `<option value="${item.id}">${item.name}</option>`).join('')}`;
}

function fillCategoryForm(item = {}) {
  document.getElementById('categoryId').value = item.id || '';
  document.getElementById('categoryName').value = item.name || '';
  document.getElementById('categorySlug').value = item.slug || '';
  document.getElementById('categoryButtonLabel').value = item.button_label || '';
  document.getElementById('categorySortOrder').value = item.sort_order || 1;
  document.getElementById('categoryDescription').value = item.description || '';
  document.getElementById('categoryIsActive').checked = item.is_active ?? true;
  document.getElementById('categoryFormTitle').textContent = item.id ? 'Kategoriyani tahrirlash' : 'Kategoriya qo‘shish';
}

function fillPlanForm(item = {}) {
  document.getElementById('planId').value = item.id || '';
  document.getElementById('planCategoryId').value = item.category_id || state.categories[0]?.id || '';
  document.getElementById('planParentPlanId').value = item.parent_plan_id || '';
  document.getElementById('planName').value = item.name || '';
  document.getElementById('planButtonLabel').value = item.button_label || '';
  document.getElementById('planPrice').value = item.price || '';
  document.getElementById('planCurrency').value = item.currency || 'UZS';
  document.getElementById('planDuration').value = item.duration || '';
  document.getElementById('planSortOrder').value = item.sort_order || 1;
  document.getElementById('planWarrantyText').value = item.warranty_text || '';
  document.getElementById('planDescription').value = item.description || '';
  document.getElementById('planHowItWorksText').value = item.how_it_works_text || '';
  document.getElementById('planPaymentInstructions').value = item.payment_instructions || '';
  document.getElementById('planIsActive').checked = item.is_active ?? true;
  document.getElementById('planFormTitle').textContent = item.id ? 'Rejani tahrirlash' : 'Reja qo‘shish';
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
}

async function loadSettings() {
  const data = await api('admin-settings');
  state.settings = data.settings || {};
  document.getElementById('sellerCardNumber').value = state.settings.seller_card_number || '';
  document.getElementById('sellerDisplayName').value = state.settings.seller_display_name || '';
  document.getElementById('adminTelegramId').value = state.settings.admin_telegram_id || '';
  document.getElementById('supportLink').value = state.settings.support_link || '';
  document.getElementById('welcomeText').value = state.settings.welcome_text || '';
  document.getElementById('contactText').value = state.settings.contact_text || '';
}

async function deleteItem(type, id) {
  if (!confirm('Rostdan ham o‘chirmoqchimisiz?')) return;
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
  await Promise.all([loadDashboard(), loadData(), loadSettings()]);
}

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
    currency: document.getElementById('planCurrency').value,
    duration: document.getElementById('planDuration').value,
    sort_order: Number(document.getElementById('planSortOrder').value || 1),
    warranty_text: document.getElementById('planWarrantyText').value,
    description: document.getElementById('planDescription').value,
    how_it_works_text: document.getElementById('planHowItWorksText').value,
    payment_instructions: document.getElementById('planPaymentInstructions').value,
    is_active: document.getElementById('planIsActive').checked,
  };
  await api('admin-data', { method: item.id ? 'PUT' : 'POST', body: JSON.stringify({ type: 'plan', item }) });
  fillPlanForm();
  await initApp();
});

document.getElementById('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await api('admin-settings', {
    method: 'PUT',
    body: JSON.stringify({
      seller_card_number: document.getElementById('sellerCardNumber').value,
      seller_display_name: document.getElementById('sellerDisplayName').value,
      admin_telegram_id: document.getElementById('adminTelegramId').value,
      support_link: document.getElementById('supportLink').value,
      welcome_text: document.getElementById('welcomeText').value,
      contact_text: document.getElementById('contactText').value,
    }),
  });
  await initApp();
});

initApp().catch((error) => {
  document.getElementById('loginError').textContent = error.message;
});
