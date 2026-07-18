let tg = window.Telegram.WebApp;
tg.expand();

const loaderEl = document.getElementById('loader');
const contentEl = document.getElementById('content');
const modalEl = document.getElementById('checkout-modal');
const closeModalBtn = document.getElementById('close-modal');
const buyBtn = document.getElementById('buy-btn');

let selectedPlan = null;

async function fetchCatalog() {
  try {
    const initData = tg.initData || '';
    const res = await fetch(`/api/webapp-api?action=catalog`, {
      headers: {
        'x-tg-init-data': initData
      }
    });
    const data = await res.json();
    if (data.ok) {
      renderCatalog(data.categories, data.plans);
    } else {
      showError('Ma\'lumotlarni yuklashda xatolik: ' + data.error);
    }
  } catch (err) {
    showError('Tarmoq xatosi: ' + err.message);
  }
}

function showError(msg) {
  loaderEl.style.display = 'none';
  contentEl.style.display = 'block';
  contentEl.innerHTML = `<p style="text-align:center;color:var(--danger, red)">${msg}</p>`;
}

function renderCatalog(categories, plans) {
  loaderEl.style.display = 'none';
  contentEl.style.display = 'block';
  contentEl.innerHTML = '';

  categories.forEach(cat => {
    const catPlans = plans.filter(p => p.category_id === cat.id);
    if (catPlans.length === 0) return;

    const section = document.createElement('div');
    section.className = 'category-section';
    
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = cat.name;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'plans-grid';

    catPlans.forEach(plan => {
      const card = document.createElement('div');
      card.className = 'plan-card';
      card.onclick = () => showModal(plan);
      
      let priceHtml = `<div class="plan-price">${plan.price} ${plan.currency}</div>`;
      if (plan.old_price) {
        priceHtml += `<div class="plan-old-price">${plan.old_price} ${plan.currency}</div>`;
      }

      card.innerHTML = `
        <div class="plan-name">${plan.name}</div>
        ${priceHtml}
      `;
      grid.appendChild(card);
    });

    section.appendChild(grid);
    contentEl.appendChild(section);
  });
}

function showModal(plan) {
  selectedPlan = plan;
  document.getElementById('modal-title').textContent = plan.name;
  document.getElementById('modal-price').textContent = `${plan.price} ${plan.currency}`;
  document.getElementById('modal-desc').textContent = plan.description || '';
  modalEl.style.display = 'flex';
  tg.MainButton.setText('SOTIB OLISH');
  tg.MainButton.show();
}

closeModalBtn.onclick = () => {
  modalEl.style.display = 'none';
  tg.MainButton.hide();
};

tg.MainButton.onClick(() => {
  if (!selectedPlan) return;
  createOrder(selectedPlan.id);
});

buyBtn.onclick = () => {
  if (!selectedPlan) return;
  createOrder(selectedPlan.id);
};

async function createOrder(planId) {
  tg.MainButton.showProgress();
  try {
    const res = await fetch('/api/webapp-api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tg-init-data': tg.initData || ''
      },
      body: JSON.stringify({ action: 'create_order', planId })
    });
    const data = await res.json();
    if (data.ok) {
      tg.showAlert("Buyurtma yaratildi! To'lov oynasiga o'tasiz.", () => {
        tg.close();
      });
    } else {
      tg.showAlert("Xatolik: " + data.error);
    }
  } catch (err) {
    tg.showAlert("Tarmoq xatosi: " + err.message);
  } finally {
    tg.MainButton.hideProgress();
  }
}

fetchCatalog();
