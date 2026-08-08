// Vakansiya (bepul e'lonlar doskasi) — admin panel qismi.
// Alohida fayl: app.js dagi do'kon mantiqiga tegmaydi.
// Backend: /api/vacancy-admin (cookie sessiyasi bilan himoyalangan).

(function vacancyAdmin() {
  const vState = { workers: [], stats: null, loaded: false };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
      ['Faol ishchilar', s.active_workers],
      ['Kutilayotgan arizalar', s.pending_workers],
      ['Banlangan', s.banned_workers],
      ["Jami e'lonlar", s.listings_total],
      ["Faol e'lonlar", s.listings_active],
      ['Chernovik', s.listings_draft],
      ["Shu haftada qo'shilgan", s.listings_week],
    ];
    root.innerHTML = cards
      .map((c) => `<div class="card"><h3>${esc(c[0])}</h3><strong>${esc(c[1])}</strong></div>`)
      .join('');
  }

  /* ---------- Ishchilar ---------- */

  function renderWorkers() {
    const root = document.getElementById('vacWorkersList');
    if (!root) return;
    if (!vState.workers.length) {
      root.innerHTML = '<p class="muted">Ro\'yxat bo\'sh.</p>';
      return;
    }
    root.innerHTML = `<table><thead><tr><th>Ism</th><th>Telefon</th><th>Kategoriya</th><th>Tajriba</th><th></th></tr></thead><tbody>${vState.workers
      .map(
        (w) => `
      <tr>
        <td>${esc(w.name)}<br><span class="muted">${esc(w.user_id)}</span></td>
        <td>${esc(w.phone)}</td>
        <td>${esc((w.categories || []).join(', '))}</td>
        <td>${esc(w.experience_years)} yil</td>
        <td>
          ${!w.is_approved && !w.is_banned ? `<button class="ghost vac-worker" data-act="approve" data-id="${w.id}">Tasdiqlash</button>` : ''}
          ${!w.is_approved && !w.is_banned ? `<button class="ghost danger vac-worker" data-act="reject" data-id="${w.id}">Rad etish</button>` : ''}
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
    // Nav'dagi badge — kutilayotgan arizalar soni.
    if (tab === 'pending') setBadge('vacPendingBadge', vState.workers.length);
  }

  /* ---------- Yuklash va hodisalar ---------- */

  async function loadAll() {
    if (!document.getElementById('vacancyView')) return;
    try {
      const stats = await vApi('admin/stats');
      vState.stats = stats.stats;
      renderStats();
      setBadge('vacPendingBadge', vState.stats.pending_workers);
      await loadWorkers();
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
    // Bo'lim birinchi ochilganda yuklanadi (har init'da emas).
    document.querySelector('.nav-link[data-view="vacancy"]')?.addEventListener('click', () => {
      if (!vState.loaded) loadAll();
    });

    document.querySelectorAll('.vac-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.getElementById('vacReloadButton')?.addEventListener('click', () => loadAll());
    document.getElementById('vacWorkerTab')?.addEventListener('change', () => loadWorkers());

    document.getElementById('vacancyView')?.addEventListener('click', async (event) => {
      const target = event.target.closest('button.vac-worker');
      if (!target) return;

      try {
        const act = target.dataset.act;
        let reason;
        if (act === 'reject' || act === 'ban') {
          reason = prompt(act === 'ban' ? 'Ban sababi:' : 'Rad etish sababi:');
          if (reason === null) return;
        }
        const map = {
          approve: 'admin/worker-approve',
          reject: 'admin/worker-reject',
          ban: 'admin/worker-ban',
          unban: 'admin/worker-unban',
        };
        await vApi(map[act], { worker_id: Number(target.dataset.id), reason });
        await loadWorkers();
      } catch (error) {
        alert(`Xatolik: ${error.message}`);
      }
    });
  });
})();
