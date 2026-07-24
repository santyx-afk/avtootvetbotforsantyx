// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();
tg.enableClosingConfirmation();

// Global State
const state = {
    catalog: [],
    profile: null,
    subscriptions: [],
    orders: [],
    balance: 0,
    stats: {},
    cart: null, // Currently selected plan for checkout
    checkoutTimer: null,
    checkoutRemainingSeconds: 900, // 15 mins
    wishlist: JSON.parse(localStorage.getItem('wishlist') || '[]'),
    lang: localStorage.getItem('lang') || 'uz',
    theme: localStorage.getItem('theme') || 'dark',
    sortMode: 'ommabop', // arzonroq, qimmatroq, ommabop, yangi
    searchQuery: ''
};

// i18n Translations
const i18n = {
    uz: {
        tab_catalog: "Katalog",
        tab_subscriptions: "Obunalar",
        tab_profile: "Profil",
        copied: "Nusxalandi 📋",
        timeout: "⏰ Buyurtma muddati tugadi",
        balance_enough: "Balansingiz yetarli! To'lov kerak emas",
        pay_btn: "To'lov qildim",
        renew: "Uzaytirish",
        reactivate: "Qayta faollashtirish",
        out_of_stock: "Zaxira tugagan",
        notify_me: "Bildirishnoma olish",
        buy: "Xarid qilish",
        waitlist_success: "Siz navbatga qo'shildingiz!",
        search_ph: "Qidirish..."
    },
    ru: {
        tab_catalog: "Каталог",
        tab_subscriptions: "Подписки",
        tab_profile: "Профиль",
        copied: "Скопировано 📋",
        timeout: "⏰ Время заказа истекло",
        balance_enough: "Баланса достаточно! Оплата не требуется",
        pay_btn: "Я оплатил",
        renew: "Продлить",
        reactivate: "Восстановить",
        out_of_stock: "Нет в наличии",
        notify_me: "Уведомить меня",
        buy: "Купить",
        waitlist_success: "Вы добавлены в очередь!",
        search_ph: "Поиск..."
    }
};

const t = (key) => i18n[state.lang][key] || key;

// Utility functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// API Fetch Wrapper
async function apiCall(action, method = 'GET', body = null) {
    try {
        const url = new URL(window.location.origin + '/api/webapp-api');
        url.searchParams.set('action', action);
        
        const options = {
            method,
            headers: {
                'x-tg-init-data': tg.initData || 'dummy_data',
                'Content-Type': 'application/json'
            }
        };
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(url.toString(), options);
        if (!response.ok) throw new Error('API Error');
        return await response.json();
    } catch (e) {
        console.error("API Call Failed", e);
        return { ok: false, error: e.message };
    }
}

// --------------------------------------------------------
// UI Components & Core Logic
// --------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initLang();
    initOnboarding();
    initTabs();
    initModals();
    initSearchAndSort();
    initProfileActions();
    
    // Initial Load
    fetchCatalog();
    fetchProfile();
});

// Toast
function showToast(message, duration = 2000) {
    const toast = $('#dynamic-island-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// Tabs
function initTabs() {
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active from all tabs & pages
            $$('.tab').forEach(t => t.classList.remove('active'));
            $$('.page').forEach(p => p.classList.remove('active'));
            
            // Add active to clicked tab
            const targetId = tab.dataset.target;
            tab.classList.add('active');
            const targetPage = $('#' + targetId);
            if(targetPage) targetPage.classList.add('active');
            
            if(tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
            
            // Refresh profile if switching to it
            if(targetId === 'page-profile' || targetId === 'page-subscriptions') {
                fetchProfile();
            }
        });
    });
}

// Theme & Lang
function initTheme() {
    document.body.classList.toggle('light-theme', state.theme === 'light');
    const toggleBtn = $('#theme-toggle');
    if (toggleBtn) {
        // checked = dark mode, unchecked = light mode
        toggleBtn.checked = state.theme === 'dark';
        toggleBtn.addEventListener('change', (e) => {
            state.theme = e.target.checked ? 'dark' : 'light';
            localStorage.setItem('theme', state.theme);
            document.body.classList.toggle('light-theme', state.theme === 'light');
        });
    }
}

function initLang() {
    const toggleBtn = $('#lang-toggle');
    if (toggleBtn) {
        toggleBtn.textContent = state.lang.toUpperCase();
        toggleBtn.addEventListener('click', () => {
            state.lang = state.lang === 'uz' ? 'ru' : 'uz';
            localStorage.setItem('lang', state.lang);
            toggleBtn.textContent = state.lang.toUpperCase();
            applyLanguage();
        });
    }
    applyLanguage();
}

function applyLanguage() {
    // Basic replacements
    const searchInput = $('#search-input');
    if(searchInput) searchInput.placeholder = t('search_ph');
    
    // Dynamically update UI texts based on language
    const langMap = {
        '#tab-bar .tab[data-target="page-catalog"] span': t('tab_catalog'),
        '#tab-bar .tab[data-target="page-subscriptions"] span': t('tab_subscriptions'),
        '#tab-bar .tab[data-target="page-profile"] span': t('tab_profile'),
        '#page-subscriptions h2:nth-of-type(1)': state.lang === 'uz' ? 'Faol obunalar' : 'Активные подписки',
        '#page-subscriptions h2:nth-of-type(2)': state.lang === 'uz' ? 'Arxivlangan obunalar' : 'Архивированные',
        '#page-profile h3': state.lang === 'uz' ? 'Xaridlar tarixi' : 'История покупок',
        '#checkout-modal h2': state.lang === 'uz' ? 'To\'lov' : 'Оплата',
        '#topup-modal h2': state.lang === 'uz' ? 'Balansni to\'ldirish' : 'Пополнение баланса'
    };
    
    for (const [selector, text] of Object.entries(langMap)) {
        const el = $(selector);
        if(el) el.textContent = text;
    }
    
    // Re-render UI chunks
    renderCatalog();
    if(state.subscriptions.length) renderSubscriptions();
}

// Search and Sort
function initSearchAndSort() {
    const searchInput = $('#search-input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase();
            renderCatalog();
        });
    }

    $$('.sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            $$('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sortMode = btn.textContent.toLowerCase();
            if(tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
            renderCatalog();
        });
    });
}

// --------------------------------------------------------
// Catalog Logic
// --------------------------------------------------------
async function fetchCatalog() {
    showSkeleton(true);
    const res = await apiCall('catalog');
    showSkeleton(false);
    
    if (res.ok) {
        state.catalog = res.plans || [];
        renderCarousel();
        renderCatalog();
    }
}

function showSkeleton(show) {
    const skeleton = $('#catalog-skeleton');
    const content = $('#catalog-content');
    if (show) {
        if(skeleton) skeleton.classList.remove('hidden');
        if(content) content.classList.add('hidden');
        if(skeleton) {
            skeleton.innerHTML = Array(4).fill('<div class="skeleton-item"></div>').join('');
        }
    } else {
        if(skeleton) skeleton.classList.add('hidden');
        if(content) content.classList.remove('hidden');
    }
}

function renderCarousel() {
    const carousel = $('#carousel-banner');
    if(!carousel) return;
    
    // Just pick top 3 plans for carousel
    const topPlans = state.catalog.slice(0, 3);
    carousel.innerHTML = topPlans.map(plan => `
        <div class="carousel-slide" onclick="openProductDetail('${plan.id}')">
            <h3>${plan.name}</h3>
            <p>${plan.price} UZS</p>
        </div>
    `).join('');
}

function renderCatalog() {
    const container = $('#catalog-content');
    if(!container) return;

    // Filter
    let filtered = state.catalog;
    if (state.searchQuery) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(state.searchQuery));
    }

    // Sort
    if (state.sortMode === 'arzonroq' || state.sortMode === 'дешевле') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (state.sortMode === 'qimmatroq' || state.sortMode === 'дороже') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (state.sortMode === 'yangi' || state.sortMode === 'новые') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
        // ommabop (sort_order)
        filtered.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
    }

    container.innerHTML = filtered.map(plan => {
        const isWishlisted = state.wishlist.includes(plan.id);
        const stockStatus = plan.inventory_count === 0 ? `<span style="color:var(--danger-color);font-size:12px;">${t('out_of_stock')}</span>` : '';
        
        return `
        <div class="plan-card" onclick="openProductDetail('${plan.id}')">
            <button class="wishlist-btn-card ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist(event, '${plan.id}', this)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
            <div class="plan-name">${plan.name}</div>
            <div class="plan-price">${plan.price} UZS</div>
            ${plan.old_price ? `<div class="plan-old-price">${plan.old_price} UZS</div>` : ''}
            ${stockStatus}
        </div>
        `;
    }).join('');
}

// Wishlist
async function toggleWishlist(e, planId, btnElement) {
    e.stopPropagation(); // Prevent opening product detail
    
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    
    const index = state.wishlist.indexOf(planId);
    if (index > -1) {
        state.wishlist.splice(index, 1);
        btnElement.classList.remove('active');
    } else {
        state.wishlist.push(planId);
        btnElement.classList.add('active');
    }
    localStorage.setItem('wishlist', JSON.stringify(state.wishlist));
    
    // Sync with backend async
    apiCall('toggle_wishlist', 'POST', { planId });
}

// --------------------------------------------------------
// Modals Logic
// --------------------------------------------------------
function initModals() {
    // Close overlay clicks
    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('show');
        });
    });
    
    // Drag handle closing (simple touch simulation)
    $$('.drag-handle').forEach(handle => {
        handle.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('show');
        });
    });
}

function openProductDetail(planId) {
    const plan = state.catalog.find(p => p.id === planId);
    if (!plan) return;
    
    state.cart = plan;
    
    $('#pd-name').textContent = plan.name;
    $('#pd-desc').textContent = plan.description || plan.name;
    $('#pd-buy-btn').textContent = `${t('buy')} - ${plan.price} UZS`;
    
    // Wishlist button state
    const wlBtn = $('#pd-wishlist-btn');
    if (wlBtn) {
        wlBtn.className = state.wishlist.includes(plan.id) ? 'active' : '';
        wlBtn.onclick = (e) => toggleWishlist(e, plan.id, wlBtn);
    }
    
    $('#pd-buy-btn').onclick = () => {
        $('#product-detail-modal').classList.remove('show');
        openCheckout();
    };
    
    $('#product-detail-modal').classList.add('show');
    if(tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

function openCheckout() {
    if (!state.cart) return;
    
    const plan = state.cart;
    let finalPrice = plan.price;
    
    $('#checkout-summary').textContent = `${plan.name} - ${plan.price} UZS`;
    $('#checkout-final-price').textContent = `${finalPrice} UZS`;
    
    // Balance Toggle Logic
    const balanceSwitch = $('#checkout-balance-switch');
    if (balanceSwitch) {
        balanceSwitch.checked = false;
        balanceSwitch.onchange = (e) => {
            if (e.target.checked) {
                if (state.balance >= plan.price) {
                    finalPrice = 0;
                    showToast(t('balance_enough'));
                } else {
                    finalPrice = plan.price - state.balance;
                }
            } else {
                finalPrice = plan.price;
            }
            $('#checkout-final-price').textContent = `${finalPrice} UZS`;
        };
    }
    
    // Timer
    startCheckoutTimer();
    
    $('#checkout-pay-btn').onclick = async () => {
        const btn = $('#checkout-pay-btn');
        btn.textContent = '...';
        btn.disabled = true;
        
        const res = await apiCall('create_order', 'POST', { planId: plan.id });
        
        btn.textContent = t('pay_btn');
        btn.disabled = false;
        
        if (res.ok) {
            $('#checkout-modal').classList.remove('show');
            openSuccessModal();
        } else {
            tg.showAlert("Xatolik: " + res.error);
        }
    };
    
    $('#checkout-modal').classList.add('show');
}

function startCheckoutTimer() {
    clearInterval(state.checkoutTimer);
    state.checkoutRemainingSeconds = 900; // 15 mins
    
    const timerEl = $('#checkout-timer');
    if(!timerEl) return;
    
    state.checkoutTimer = setInterval(() => {
        state.checkoutRemainingSeconds--;
        if (state.checkoutRemainingSeconds <= 0) {
            clearInterval(state.checkoutTimer);
            $('#checkout-modal').classList.remove('show');
            showToast(t('timeout'));
            return;
        }
        
        const m = Math.floor(state.checkoutRemainingSeconds / 60);
        const s = state.checkoutRemainingSeconds % 60;
        timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
        
        if (state.checkoutRemainingSeconds <= 120) {
            timerEl.parentElement.classList.add('urgent');
        } else {
            timerEl.parentElement.classList.remove('urgent');
        }
    }, 1000);
}

// Success Modal & Confetti
function openSuccessModal() {
    $('#success-modal').classList.add('show');
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    fireConfetti();
    
    // Bind auto-clear copy buttons
    $$('.copy-btn').forEach(btn => {
        btn.onclick = () => {
            const val = btn.getAttribute('data-copy');
            if (val === 'password') {
                const pwd = $('#success-password').textContent;
                navigator.clipboard.writeText(pwd);
                showToast(t('copied'));
                // Auto clear clipboard after 60s
                setTimeout(() => navigator.clipboard.writeText(''), 60000);
            }
        };
    });
    
    // Password Eye toggle
    const eyeBtn = $('.eye-btn');
    if(eyeBtn) {
        eyeBtn.onclick = () => {
            const pwdEl = $('#success-password');
            if (pwdEl.classList.contains('obscured')) {
                pwdEl.classList.remove('obscured');
                pwdEl.textContent = 'demo_pass_123'; // Real value from API goes here
            } else {
                pwdEl.classList.add('obscured');
                pwdEl.textContent = '.............';
            }
        };
    }
    
    $('#success-close-btn').onclick = () => {
        $('#success-modal').classList.remove('show');
    };
}

function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    let particles = [];
    for(let i=0; i<100; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            r: Math.random() * 6 + 2,
            dx: Math.random() * 4 - 2,
            dy: Math.random() * 4 + 2,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`
        });
    }
    
    function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
            ctx.fillStyle = p.color;
            ctx.fill();
            p.x += p.dx;
            p.y += p.dy;
        });
        if(particles[0].y < canvas.height + 100) requestAnimationFrame(draw);
    }
    draw();
}

// --------------------------------------------------------
// Profile & Subscriptions Logic
// --------------------------------------------------------
async function fetchProfile() {
    const res = await apiCall('profile');
    if (res.ok) {
        state.profile = res.profile || res.user || {};
        state.balance = res.balance || 0;
        state.stats = res.stats || {};
        state.subscriptions = res.subscriptions || [];
        state.orders = res.orders || [];
        
        updateProfileUI();
        renderSubscriptions();
    } else {
        // Fallback to tg initData if api fails but we want to show profile
        state.profile = {};
        updateProfileUI();
    }
}

function updateProfileUI() {
    if ($('#user-name')) $('#user-name').textContent = state.profile?.first_name || tg.initDataUnsafe?.user?.first_name || 'Foydalanuvchi';
    if ($('#user-id')) $('#user-id').textContent = `ID: ${state.profile?.telegram_id || tg.initDataUnsafe?.user?.id || ''}`;
    if ($('#user-avatar') && tg.initDataUnsafe?.user?.photo_url) {
        $('#user-avatar').src = tg.initDataUnsafe.user.photo_url;
    }
    
    if ($('#user-balance')) $('#user-balance').textContent = `${state.balance} UZS`;
    if ($('#stat-purchases')) $('#stat-purchases').textContent = state.stats.totalPurchases || 0;
    if ($('#stat-saved')) $('#stat-saved').textContent = state.stats.totalSaved || 0;
    if ($('#stat-active')) $('#stat-active').textContent = state.stats.activeSubscriptions || 0;
}

function renderSubscriptions() {
    const activeCont = $('#active-subs');
    const archCont = $('#archived-subs');
    if (!activeCont || !archCont) return;
    
    const active = state.subscriptions.filter(s => s.status === 'active');
    const archived = state.subscriptions.filter(s => s.status !== 'active');
    
    activeCont.innerHTML = active.map(s => `
        <div class="sub-card">
            <h4>${s.plan_name}</h4>
            <p>Tugash sanasi: ${s.end_date}</p>
            <button class="action-btn" onclick="openProductDetail('${s.plan_id}')">${t('renew')}</button>
        </div>
    `).join('') || '<p>Faol obunalar yo\'q</p>';
    
    archCont.innerHTML = archived.map(s => `
        <div class="sub-card" style="opacity: 0.7;">
            <h4>${s.plan_name}</h4>
            <p>Tugagan: ${s.end_date}</p>
            <button class="secondary-btn" onclick="openProductDetail('${s.plan_id}')">${t('reactivate')}</button>
        </div>
    `).join('') || '<p>Arxiv bo\'sh</p>';
}

function initProfileActions() {
    const topupBtn = $('#topup-btn');
    if (topupBtn) {
        topupBtn.onclick = () => {
            $('#topup-modal').classList.add('show');
        };
    }
    
    const topupSubmit = $('#topup-submit-btn');
    if (topupSubmit) {
        topupSubmit.onclick = async () => {
            const amount = parseFloat($('#topup-amount').value);
            if (!amount || amount < 5000) {
                showToast("Min summa 5000 UZS");
                return;
            }
            topupSubmit.textContent = '...';
            topupSubmit.disabled = true;
            const res = await apiCall('topup', 'POST', { amount });
            topupSubmit.textContent = state.lang === 'uz' ? 'Tasdiqlash' : 'Подтвердить';
            topupSubmit.disabled = false;
            
            if (res.ok) {
                $('#topup-modal').classList.remove('show');
                const text = state.lang === 'uz' 
                    ? `Balans to'ldirish uchun raqam: ${res.cardNumber || '8600123456789012'}\nSumma: ${res.uniqueAmount || amount} UZS`
                    : `Номер для пополнения: ${res.cardNumber || '8600123456789012'}\nСумма: ${res.uniqueAmount || amount} UZS`;
                tg.showAlert(text);
                $('#topup-amount').value = '';
            } else {
                showToast(res.error || "Xatolik yuz berdi");
            }
        };
    }
    
    const shareBtn = $('#share-ref-btn');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const userId = tg.initDataUnsafe?.user?.id || '0';
            const text = encodeURIComponent(state.lang === 'uz' ? "Zo'r obunalar do'koni! A'zo bo'ling:" : "Отличный магазин подписок! Присоединяйтесь:");
            const shareUrl = `https://t.me/share/url?url=https://t.me/avtootvetbotforsantyx_bot?start=ref_${userId}&text=${text}`;
            tg.openTelegramLink(shareUrl);
        };
    }
    
    const contactBtn = $('#contact-admin-btn');
    if (contactBtn) {
        contactBtn.onclick = () => tg.openTelegramLink('https://t.me/santyx');
    }
}

// Onboarding Modal Basic Logic
function initOnboarding() {
    if (!localStorage.getItem('onboarding_done')) {
        const modal = $('#onboarding-modal');
        if (modal) {
            modal.classList.add('show');
            const startBtn = $('#start-btn');
            if (startBtn) {
                startBtn.onclick = () => {
                    localStorage.setItem('onboarding_done', 'true');
                    modal.classList.remove('show');
                };
            }
        }
    }
}
