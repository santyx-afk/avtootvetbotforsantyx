// Vakansiya (freelance) bo'limi — admin panel qismi.
// Alohida fayl: app.js dagi do'kon mantiqiga tegmaydi.
// Backend: /api/vacancy-admin (cookie sessiyasi bilan himoyalangan).

(function vacancyAdmin() {
  const vState = { workers: [], orders: [], reports: [], reviews: [], stats: null, loaded: false };

  const STATUS_LABEL = {
    created: 'Yaratildi',
    accepted: 'Qabul qilindi',
    payment_pending: "To'lov kutilmoqda",
    first_paid: "50% to'landi",
    materials_pending: 'Material kutilmoqda',
    in_progress: 'Jarayonda',
    result_sent: 'Natija yuborildi',
    reviewing: 'Tekshiruvda',
    revising: 'Qayta ishlanmoqda',
    final_payment_pending: "Qolgan to'lov kutilmoqda",
    completed: 'Yakunlandi',
    cancelled: 'Bekor qilindi',
    disputed: 'Nizoli',
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(value) {
    return Number(value || 0).toLocaleString('uz-UZ');
  }

  function dateLabel(value) {
    return value ? new Date(value).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
  }

  async function vApi(action, payload = {}) {
    const res = await fetch('/api/vacancy-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `Xatolik (${res.status})`);
    return data;
  }

  function setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count > 0 ? String(count) : '';
    el.hidden = !(count > 0);
  }

  /* ---------- Statistika ---------- */

  function renderStats() {
    const root = document.getElementById('vacStatsCards');
    if (!root) return;
    const s = vState.stats;
    if (!s) {
      root.innerHTML = '<p class="muted">Yuklanmoqda...</p>';
      return;
    }
    const cards = [
      ['Bugungi orderlar', s.orders_today],
      ['Haftalik orderlar', s.orders_week],
      ['Oylik orderlar', s.orders_month],
      ['Yakunlangan', s.orders_completed],
      ['Komissiya (jami)', `${money(s.commission_total)} UZS`],
      ["O'rtacha order", `${money(s.avg_order_amount)} UZS`],
      ['Faol ishchilar', s.active_workers],
      ['Kutilayotgan arizalar', s.pending_workers],
      ["To'lanmagan", s.unpaid_completed],
    ];
    // Do'kon dashboard'idagi bilan bir xil markup — uslub allaqachon mavjud.
    root.innerHTML = cards.map((c) => `<div class="card"><h3>${esc(c[0])}</h3><strong>${esc(c[1])}</strong></div>`).join('');

    const top = document.getElementById('vacTopWorkers');
    if (top) {
      top.innerHTML = s.top_workers?.length
        ? `<table><thead><tr><th>#</th><th>Ishchi</th><th>Ishlar</th><th>Daromad</th></tr></thead><tbody>${s.top_workers
            .map(
              (w, i) =>
                `<tr><td>${i + 1}</td><td>${esc(w.name)}</td><td>${w.completed_orders}</td><td>${money(w.total_earnings)} UZS</td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="muted">Hozircha ma\'lumot yo\'q.</p>';
    }
  }

  /* ---------- Ishchilar ---------- */

  function renderWorkers() {
    const root = document.getElementById('vacWorkersList');
    if (!root) return;
    if (!vState.workers.length) {
      root.innerHTML = '<p class="muted">Ro\'yxat bo\'sh.</p>';
      return;
    }
    root.innerHTML = `<table><thead><tr><th>Ism</th><th>Telefon</th><th>Kategoriya</th><th>Reyting</th><th>Ishlar</th><th>Deadline</th><th></th></tr></thead><tbody>${vState.workers
      .map(
        (w) => `
      <tr>
        <td>${esc(w.name)}<br><span class="muted">${esc(w.user_id)}</span></td>
        <td>${esc(w.phone)}</td>
        <td>${esc((w.categories || []).join(', '))}</td>
        <td>${Number(w.avg_rating || 0).toFixed(1)} (${w.total_reviews})</td>
        <td>${w.completed_orders}</td>
        <td>${w.deadline_violations}</td>
        <td>
          ${!w.is_approved && !w.is_banned ? `<button class="ghost vac-worker" data-act="approve" data-id="${w.id}">✓ Tasdiq</button>` : ''}
          ${!w.is_approved && !w.is_banned ? `<button class="ghost danger vac-worker" data-act="reject" data-id="${w.id}">✕ Rad</button>` : ''}
          ${w.is_approved && !w.is_banned ? `<button class="ghost danger vac-worker" data-act="ban" data-id="${w.id}">Ban</button>` : ''}
          ${w.is_banned ? `<button class="ghost vac-worker" data-act="unban" data-id="${w.id}">Unban</button>` : ''}
        </td>
      </tr>`,
      )
      .join('')}</tbody></table>`;
  }

  async function loadWorkers() {
    const tab = document.getElementById('vacWorkerTab')?.value || 'pending';
    const res = await vApi('admin/workers', { tab });
    vState.workers = res.workers || [];
    renderWorkers();
    if (tab === 'pending') setBadge('vacWorkersBadge', vState.workers.length);
  }

  /* ---------- Orderlar ---------- */

  function renderOrders() {
    const root = document.getElementById('vacOrdersList');
    if (!root) return;
    if (!vState.orders.length) {
      root.innerHTML = '<p class="muted">Order topilmadi.</p>';
      return;
    }
    root.innerHTML = `<table><thead><tr><th>#</th><th>Sarlavha</th><th>Summa</th><th>Komissiya</th><th>Montajorga</th><th>Holat</th><th>Sana</th><th></th></tr></thead><tbody>${vState.orders
      .map(
        (o) => `
      <tr>
        <td>${o.id}</td>
        <td>${esc(o.title)}<br><span class="muted">${esc(o.worker_name || o.worker_user_id)}</span></td>
        <td>${money(o.amount)}</td>
        <td>${money(o.commission)}</td>
        <td>${money(o.worker_amount)}${o.worker_card ? `<br><span class="muted">${esc(o.worker_card)}</span>` : ''}</td>
        <td><span class="badge">${esc(STATUS_LABEL[o.status] || o.status)}</span></td>
        <td>${dateLabel(o.created_at)}</td>
        <td>
          ${
            o.status === 'completed' && !o.worker_paid
              ? `<button class="ghost vac-order-paid" data-id="${o.id}">💰 To'landi</button>`
              : o.worker_paid
                ? '<span class="muted">To\'langan</span>'
                : ''
          }
        </td>
      </tr>`,
      )
      .join('')}</tbody></table>`;
  }

  async function loadOrders() {
    const status = document.getElementById('vacOrderStatus')?.value || '';
    const res = await vApi('admin/orders', status ? { status } : {});
    vState.orders = res.orders || [];
    renderOrders();
    setBadge('vacOrdersBadge', vState.orders.filter((o) => o.status === 'completed' && !o.worker_paid).length);
  }

  /* ---------- Reportlar ---------- */

  function renderReports() {
    const root = document.getElementById('vacReportsList');
    if (!root) return;
    if (!vState.reports.length) {
      root.innerHTML = '<p class="muted">Shikoyat yo\'q.</p>';
      return;
    }
    root.innerHTML = `<table><thead><tr><th>Kimdan</th><th>Kimga</th><th>Sabab</th><th>Oldingi</th><th>Holat</th><th></th></tr></thead><tbody>${vState.reports
      .map(
        (r) => `
      <tr>
        <td>${esc(r.reporter_id)}${r.order_id ? `<br><span class="muted">Order #${r.order_id}</span>` : ''}</td>
        <td>${esc(r.reported_id)}</td>
        <td>${esc(r.reason)}</td>
        <td>${r.reported_confirmed_count || 0} ta</td>
        <td><span class="badge">${esc(r.resolution || r.status)}</span></td>
        <td>
          ${
            r.resolution
              ? '<span class="muted">Hal qilingan</span>'
              : `
            <button class="ghost vac-report" data-act="auto" data-id="${r.id}">Auto</button>
            <button class="ghost vac-report" data-act="warn" data-id="${r.id}">Ogoh.</button>
            <button class="ghost danger vac-report" data-act="penalty" data-id="${r.id}">Shtraf</button>
            <button class="ghost danger vac-report" data-act="ban" data-id="${r.id}">Ban</button>
            <button class="ghost vac-report" data-act="dismiss" data-id="${r.id}">Bekor</button>`
          }
        </td>
      </tr>`,
      )
      .join('')}</tbody></table>`;
  }

  async function loadReports() {
    const res = await vApi('admin/reports', { status: 'pending' });
    vState.reports = res.reports || [];
    renderReports();
    setBadge('vacReportsBadge', vState.reports.filter((r) => !r.resolution).length);
  }

  /* ---------- Baholar ---------- */

  function renderVacReviews() {
    const root = document.getElementById('vacReviewsList');
    if (!root) return;
    if (!vState.reviews.length) {
      root.innerHTML = '<p class="muted">Baho yo\'q.</p>';
      return;
    }
    root.innerHTML = `<table><thead><tr><th>Order</th><th>Kimdan</th><th>Kimga</th><th>Baho</th><th>Izoh</th><th></th></tr></thead><tbody>${vState.reviews
      .map(
        (r) => `
      <tr${r.is_visible ? '' : ' class="muted"'}>
        <td>#${r.order_id}</td>
        <td>${esc(r.reviewer_role)}<br><span class="muted">${esc(r.reviewer_id)}</span></td>
        <td>${esc(r.reviewed_id)}</td>
        <td class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
        <td>${esc(r.comment || '-')}</td>
        <td>
          <button class="ghost ${r.is_visible ? 'danger' : ''} vac-review" data-id="${r.id}" data-visible="${r.is_visible ? 'false' : 'true'}">
            ${r.is_visible ? 'Yashirish' : 'Tiklash'}
          </button>
        </td>
      </tr>`,
      )
      .join('')}</tbody></table>`;
  }

  async function loadVacReviews() {
    const res = await vApi('admin/reviews');
    vState.reviews = res.reviews || [];
    renderVacReviews();
  }

  /* ---------- Yuklash va hodisalar ---------- */

  async function loadAll() {
    const root = document.getElementById('vacancyView');
    if (!root) return;
    try {
      const stats = await vApi('admin/stats');
      vState.stats = stats.stats;
      renderStats();
      await Promise.all([loadWorkers(), loadOrders(), loadReports(), loadVacReviews()]);
      vState.loaded = true;
    } catch (error) {
      const box = document.getElementById('vacError');
      if (box) box.textContent = `Yuklanmadi: ${error.message}`;
    }
  }

  function switchTab(name) {
    document.querySelectorAll('.vac-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.vac-pane').forEach((p) => {
      p.hidden = p.dataset.pane !== name;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Vakansiya bo'limi birinchi ochilganda yuklanadi (har init'da emas).
    document.querySelector('.nav-link[data-view="vacancy"]')?.addEventListener('click', () => {
      if (!vState.loaded) loadAll();
    });

    document.querySelectorAll('.vac-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.getElementById('vacReloadButton')?.addEventListener('click', () => loadAll());
    document.getElementById('vacWorkerTab')?.addEventListener('change', () => loadWorkers());
    document.getElementById('vacOrderStatus')?.addEventListener('change', () => loadOrders());

    document.getElementById('vacancyView')?.addEventListener('click', async (event) => {
      const target = event.target.closest('button');
      if (!target) return;

      try {
        if (target.classList.contains('vac-worker')) {
          const act = target.dataset.act;
          let reason;
          if (act === 'reject' || act === 'ban') {
            reason = prompt(act === 'ban' ? 'Ban sababi:' : 'Rad etish sababi:');
            if (reason === null) return;
          }
          const map = { approve: 'admin/worker-approve', reject: 'admin/worker-reject', ban: 'admin/worker-ban', unban: 'admin/worker-unban' };
          await vApi(map[act], { worker_id: Number(target.dataset.id), reason });
          await loadWorkers();
        } else if (target.classList.contains('vac-order-paid')) {
          if (!confirm('Montajorga pul o\'tkazildimi? Tasdiqlasangiz unga xabar boradi.')) return;
          await vApi('admin/order-paid', { order_id: Number(target.dataset.id) });
          await loadOrders();
        } else if (target.classList.contains('vac-report')) {
          const act = target.dataset.act;
          const notes = act === 'dismiss' ? '' : prompt('Izoh (ixtiyoriy):') ?? '';
          await vApi('admin/report-resolve', { report_id: Number(target.dataset.id), action: act, admin_notes: notes });
          await loadReports();
        } else if (target.classList.contains('vac-review')) {
          await vApi('admin/review-visibility', {
            review_id: Number(target.dataset.id),
            is_visible: target.dataset.visible === 'true',
          });
          await loadVacReviews();
        }
      } catch (error) {
        alert(`Xatolik: ${error.message}`);
      }
    });
  });
})();
