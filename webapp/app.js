// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();
tg.enableClosingConfirmation();

// Global State
const state = {
    catalog: [],
    plans: [],
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
    sortMode: 'ommabop' // arzonroq, qimmatroq, ommabop, yangi
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
        theme_light: "Kunduzgi",
        theme_dark: "Tungi",
        waitlist_success: "Siz navbatga qo'shildingiz!"
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
        theme_light: "Светлая",
        theme_dark: "Темная",
        waitlist_success: "Вы добавлены в очередь!"
    }
};

const t = (key) => i18n[state.lang][key] || key;

// Utility functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Toast
function showToast(message, duration = 2000) {
    const toast = $('#dynamic-island-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    tg.HapticFeedback.notificationOccurred('success');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

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
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url.toString(), options);
        if (!response.ok) throw new Error('API Error');
        return await response.json();
    } catch (e) {
        console.error("API Call Failed", e);
        // Fallback mock data for development
        return mockApi(action, body);
    }
}

// Mock API for testing logic
function mockApi(action, body) {
    if (action === 'catalog') {
        return {
            ok: true,
            plans: [
                { id: 1, name: 'Premium Plan 1', price: 15000, old_price: 20000, image_url: '', desc: 'Best premium plan', stock: 10, sort_order: 1, created_at: Date.now() },
                { id: 2, name: 'Basic Plan', price: 5000, old_price: 0, image_url: '', desc: 'Basic plan', stock: 0, sort_order: 2, created_at: Date.now() - 10000 },
                { id: 3, name: 'Pro Plan', price: 30000, old_price: 40000, image_url: '', desc: 'Professional plan', stock: 5, sort_order: 3, created_at: Date.now() - 5000 }
            ]
        };
    }
    if (action === 'profile') {
        return {
            ok: true,
            profile: { name: tg.initDataUnsafe?.user?.first_name || 'User', id: tg.initDataUnsafe?.user?.id || '123' },
            balance: 10000,
            stats: { purchases: 5, saved: 50000, active: 1 },
            subscriptions: [
                { id: 1, plan_name: 'Premium Plan 1', expires_in_days: 2, status: 'active' },
                { id: 2, plan_name: 'Basic Plan', expires_in_days: -5, status: 'archived' }
            ],
            orders: [
                { id: 101, amount: 15000, date: '2023-10-01', type: 'Click' }
            ]
        };
    }
    if (action === 'create_order') return { ok: true, order: { id: 999, login: 'user123', password: 'password123' } };
    return { ok: true };
}

// --------------------------------------------------------
// Initialization
// --------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initLang();
    initOnboarding();
    initOfflineDetection();
    initTabs();
    initCopyButtons();
    initCarousel();
    initSearchAndSort();
    initModals();
    
    // Load default page
    loadCatalog();
});

// --------------------------------------------------------
// Onboarding
// --------------------------------------------------------
function initOnboarding() {
    if (!localStorage.getItem('onboarding_done')) {
        const modal = $('#onboarding-modal');
        if (modal) modal.style.display = 'block';
        
        let currentSlide = 1;
        const startBtn = $('#start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                localStorage.setItem('onboarding_done', 'true');
                if (modal) modal.style.display = 'none';
            });
        }
        
        // Handling slides visibility can be added if needed based on the DOM structure
        // Assuming user clicks through slides logic here
    }
}

// --------------------------------------------------------
// Offline Detection
// --------------------------------------------------------
function initOfflineDetection() {
    window.addEventListener('online', updateOfflineStatus);
    window.addEventListener('offline', updateOfflineStatus);
    updateOfflineStatus();
}

function updateOfflineStatus() {
    const banner = $('#offline-banner');
    if (banner) {
        banner.style.display = navigator.onLine ? 'none' : 'block';
    }
}

// --------------------------------------------------------
// Theme & Language
// --------------------------------------------------------
function initTheme() {
    document.body.classList.toggle('light-theme', state.theme === 'light');
    const toggleBtn = $('#theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            state.theme = state.theme === 'light' ? 'dark' : 'light';
            document.body.classList.toggle('light-theme', state.theme === 'light');
            localStorage.setItem('theme', state.theme);
            tg.HapticFeedback.selectionChanged();
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
            updateUIRelatedToLang();
            tg.HapticFeedback.selectionChanged();
        });
    }
}

function updateUIRelatedToLang() {
    // Basic UI updates, in real implementation needs data attributes to loop over
    loadCatalog(false); // reload without fetching
}

// --------------------------------------------------------
// Tabs
// --------------------------------------------------------
function initTabs() {
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            switchTab(target);
            tg.HapticFeedback.selectionChanged();
        });
    });
}

function switchTab(targetId) {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $(`.tab[data-target="${targetId}"]`)?.classList.add('active');

    $$('.page').forEach(p => p.style.display = 'none');
    const targetPage = $(`#${targetId}`);
    if (targetPage) targetPage.style.display = 'block';

    if (targetId === 'page-catalog') loadCatalog();
    if (targetId === 'page-subscriptions') loadSubscriptions();
    if (targetId === 'page-profile') loadProfile();
}

// --------------------------------------------------------
// 1-Tap Copy
// --------------------------------------------------------
function initCopyButtons() {
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.copy-btn');
        if (!btn) return;
        
        const targetId = btn.getAttribute('data-copy-target');
        const text = targetId ? $(`#${targetId}`)?.textContent : btn.previousElementSibling?.textContent;
        
        if (text) {
            navigator.clipboard.writeText(text.trim()).then(() => {
                showToast(t('copied'));
                
                // Auto clear if password
                if (btn.classList.contains('copy-pass')) {
                    setTimeout(() => navigator.clipboard.writeText(''), 60000);
                }
            });
        }
    });
}

// --------------------------------------------------------
// Catalog
// --------------------------------------------------------
function showSkeleton() {
    const skel = $('#catalog-skeleton');
    const content = $('#catalog-content');
    if (skel) skel.style.display = 'grid';
    if (content) content.style.display = 'none';
}

function hideSkeleton() {
    const skel = $('#catalog-skeleton');
    const content = $('#catalog-content');
    if (skel) skel.style.display = 'none';
    if (content) content.style.display = 'grid';
}

async function loadCatalog(fetchData = true) {
    if (fetchData) {
        showSkeleton();
        const res = await apiCall('catalog');
        if (res.ok) {
            state.plans = res.plans || [];
        }
        hideSkeleton();
    }
    renderCatalog();
    renderCarousel();
}

function renderCatalog() {
    const container = $('#catalog-content');
    if (!container) return;
    
    let filtered = [...state.plans];
    
    // Search
    const searchInput = $('#search-input');
    if (searchInput && searchInput.value) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchInput.value.toLowerCase()));
    }
    
    // Sort
    if (state.sortMode === 'arzonroq') filtered.sort((a, b) => a.price - b.price);
    if (state.sortMode === 'qimmatroq') filtered.sort((a, b) => b.price - a.price);
    if (state.sortMode === 'ommabop') filtered.sort((a, b) => a.sort_order - b.sort_order);
    if (state.sortMode === 'yangi') filtered.sort((a, b) => b.created_at - a.created_at);

    container.innerHTML = '';
    filtered.forEach(plan => {
        const isWishlisted = state.wishlist.includes(plan.id);
        const card = document.createElement('div');
        card.className = 'catalog-card';
        card.innerHTML = `
            <div class="card-img" style="background-image: url('${plan.image_url}')"></div>
            <div class="card-info">
                <h3>${plan.name}</h3>
                <div class="price">
                    <span>${plan.price} UZS</span>
                    ${plan.old_price ? `<span class="old-price">${plan.old_price}</span>` : ''}
                </div>
            </div>
            <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" data-id="${plan.id}">❤️</button>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.wishlist-btn')) {
                openProductDetail(plan);
            }
        });
        
        const wlBtn = card.querySelector('.wishlist-btn');
        wlBtn.addEventListener('click', () => toggleWishlist(plan.id, wlBtn));
        
        container.appendChild(card);
    });
}

function toggleWishlist(id, btnElement) {
    const idx = state.wishlist.indexOf(id);
    if (idx > -1) {
        state.wishlist.splice(idx, 1);
        if (btnElement) btnElement.classList.remove('active');
    } else {
        state.wishlist.push(id);
        if (btnElement) btnElement.classList.add('active');
    }
    localStorage.setItem('wishlist', JSON.stringify(state.wishlist));
    apiCall('toggle_wishlist', 'POST', { planId: id });
    tg.HapticFeedback.impactOccurred('light');
}

function initSearchAndSort() {
    const searchInput = $('#search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderCatalog());
        searchInput.addEventListener('focus', () => {
            const tags = $('#trending-tags');
            if (tags) tags.style.display = 'block';
        });
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                const tags = $('#trending-tags');
                if (tags) tags.style.display = 'none';
            }, 200);
        });
    }

    $$('.sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            state.sortMode = e.currentTarget.getAttribute('data-sort');
            renderCatalog();
        });
    });
}

let carouselInterval;
function initCarousel() {
    // Managed in renderCarousel
}

function renderCarousel() {
    const banner = $('#carousel-banner');
    if (!banner) return;
    banner.innerHTML = '';
    
    const topPlans = state.plans.slice(0, 3);
    if (topPlans.length === 0) return;
    
    topPlans.forEach((plan, idx) => {
        const slide = document.createElement('div');
        slide.className = `carousel-slide ${idx === 0 ? 'active' : ''}`;
        slide.innerHTML = `<div>${plan.name}</div>`;
        banner.appendChild(slide);
    });

    let currentSlide = 0;
    const slides = banner.querySelectorAll('.carousel-slide');
    
    clearInterval(carouselInterval);
    carouselInterval = setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, 4000);
}

// --------------------------------------------------------
// Product Detail Modal
// --------------------------------------------------------
function openProductDetail(plan) {
    state.cart = plan;
    const modal = $('#product-detail-modal');
    if (!modal) return;
    
    const img = $('#pd-image');
    if (img) img.style.backgroundImage = `url('${plan.image_url}')`;
    
    const name = $('#pd-name');
    if (name) name.textContent = plan.name;
    
    const desc = $('#pd-desc');
    if (desc) desc.textContent = plan.desc;
    
    const buyBtn = $('#pd-buy-btn');
    if (buyBtn) {
        if (plan.stock > 0) {
            buyBtn.textContent = t('buy');
            buyBtn.onclick = () => {
                modal.style.display = 'none';
                openCheckout();
            };
        } else {
            buyBtn.textContent = t('notify_me');
            buyBtn.onclick = async () => {
                await apiCall('join_waitlist', 'POST', { planId: plan.id });
                showToast(t('waitlist_success'));
            };
        }
    }
    
    const wlBtn = $('#pd-wishlist-btn');
    if (wlBtn) {
        wlBtn.className = state.wishlist.includes(plan.id) ? 'active' : '';
        wlBtn.onclick = () => toggleWishlist(plan.id, wlBtn);
    }
    
    modal.style.display = 'block';
}

// --------------------------------------------------------
// Checkout Modal
// --------------------------------------------------------
function openCheckout() {
    const modal = $('#checkout-modal');
    if (!modal || !state.cart) return;
    
    const summary = $('#checkout-summary');
    if (summary) summary.textContent = `${state.cart.name} - ${state.cart.price} UZS`;
    
    updateCheckoutPrice();
    startCheckoutTimer();
    
    const payBtn = $('#checkout-pay-btn');
    if (payBtn) {
        payBtn.onclick = processCheckout;
    }
    
    const balanceSwitch = $('#checkout-balance-switch');
    if (balanceSwitch) {
        balanceSwitch.onchange = updateCheckoutPrice;
    }

    modal.style.display = 'block';
}

function updateCheckoutPrice() {
    const finalPriceEl = $('#checkout-final-price');
    const balanceSwitch = $('#checkout-balance-switch');
    
    let price = state.cart.price;
    if (balanceSwitch && balanceSwitch.checked) {
        if (state.balance >= price) {
            price = 0;
            if(finalPriceEl) finalPriceEl.textContent = t('balance_enough');
            return;
        } else {
            price -= state.balance;
        }
    }
    
    if (finalPriceEl) finalPriceEl.textContent = `${price} UZS`;
}

function startCheckoutTimer() {
    clearInterval(state.checkoutTimer);
    state.checkoutRemainingSeconds = 900;
    
    const timerEl = $('#checkout-timer');
    
    state.checkoutTimer = setInterval(() => {
        state.checkoutRemainingSeconds--;
        if (state.checkoutRemainingSeconds <= 0) {
            clearInterval(state.checkoutTimer);
            $('#checkout-modal').style.display = 'none';
            showToast(t('timeout'));
            return;
        }
        
        if (timerEl) {
            const m = Math.floor(state.checkoutRemainingSeconds / 60);
            const s = state.checkoutRemainingSeconds % 60;
            timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
        }
    }, 1000);
}

async function processCheckout() {
    const btn = $('#checkout-pay-btn');
    if (btn) btn.disabled = true;
    
    const res = await apiCall('create_order', 'POST', { planId: state.cart.id });
    
    if (btn) btn.disabled = false;
    
    if (res.ok && res.order) {
        $('#checkout-modal').style.display = 'none';
        clearInterval(state.checkoutTimer);
        openSuccessModal(res.order);
        // refresh profile/balance later
    }
}

// --------------------------------------------------------
// Success Modal
// --------------------------------------------------------
function openSuccessModal(order) {
    const modal = $('#success-modal');
    if (!modal) return;
    
    $('#success-login').textContent = order.login;
    $('#success-password').textContent = order.password; // visually hidden usually via CSS
    
    triggerConfetti();
    tg.HapticFeedback.notificationOccurred('success');
    
    modal.style.display = 'block';
}

function triggerConfetti() {
    const canvas = $('#confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    let particles = [];
    for(let i=0; i<100; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10 - 5,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            size: Math.random() * 5 + 2
        });
    }
    
    function draw() {
        ctx.clearRect(0,0, canvas.width, canvas.height);
        let active = false;
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2; // gravity
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            if (p.y < canvas.height) active = true;
        });
        if (active) requestAnimationFrame(draw);
    }
    draw();
}

// --------------------------------------------------------
// Profile Page
// --------------------------------------------------------
async function loadProfile() {
    const res = await apiCall('profile');
    if (res.ok) {
        state.profile = res.profile;
        state.balance = res.balance;
        state.stats = res.stats;
        state.subscriptions = res.subscriptions;
        state.orders = res.orders;
        
        renderProfile();
        checkExpiryBanner();
    }
}

function renderProfile() {
    const avatar = $('#user-avatar');
    if (avatar && tg.initDataUnsafe?.user?.photo_url) {
        avatar.src = tg.initDataUnsafe.user.photo_url;
    }
    
    if ($('#user-name')) $('#user-name').textContent = state.profile?.name || '';
    if ($('#user-id')) $('#user-id').textContent = `ID: ${state.profile?.id || ''}`;
    
    if ($('#stat-purchases')) $('#stat-purchases').textContent = state.stats?.purchases || 0;
    if ($('#stat-saved')) $('#stat-saved').textContent = state.stats?.saved || 0;
    if ($('#stat-active')) $('#stat-active').textContent = state.stats?.active || 0;
    
    if ($('#user-balance')) $('#user-balance').textContent = `${state.balance} UZS`;
    
    renderOrderHistory();
}

function renderOrderHistory() {
    const list = $('#history-list');
    if (!list) return;
    list.innerHTML = '';
    
    state.orders.forEach(order => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div>Order #${order.id}</div>
            <div>${order.amount} UZS</div>
            <div>${order.date}</div>
        `;
        el.onclick = () => openReceipt(order);
        list.appendChild(el);
    });
}

// --------------------------------------------------------
// Subscriptions Page
// --------------------------------------------------------
function loadSubscriptions() {
    const activeList = $('#active-subs');
    const archivedList = $('#archived-subs');
    if (!activeList || !archivedList) return;
    
    activeList.innerHTML = '';
    archivedList.innerHTML = '';
    
    state.subscriptions.forEach(sub => {
        const el = document.createElement('div');
        el.className = 'sub-card';
        if (sub.status === 'active') {
            el.innerHTML = `
                <h4>${sub.plan_name}</h4>
                <div class="progress"><div style="width: ${Math.max(0, (sub.expires_in_days / 30) * 100)}%"></div></div>
                <div>Qolgan kunlar: ${sub.expires_in_days}</div>
                <button class="renew-btn" data-id="${sub.id}">${t('renew')}</button>
            `;
            activeList.appendChild(el);
        } else {
            el.innerHTML = `
                <h4>${sub.plan_name}</h4>
                <div>Muddati tugagan</div>
                <button class="reactivate-btn" data-id="${sub.id}">${t('reactivate')}</button>
            `;
            archivedList.appendChild(el);
        }
    });
}

function checkExpiryBanner() {
    const expiring = state.subscriptions.find(s => s.status === 'active' && s.expires_in_days <= 3);
    const banner = $('#expiry-banner');
    if (banner) {
        banner.style.display = expiring ? 'block' : 'none';
        if (expiring) {
            banner.innerHTML = `Diqqat! "${expiring.plan_name}" obunangiz tugashiga ${expiring.expires_in_days} kun qoldi. <a href="#" onclick="switchTab('page-subscriptions')">Uzaytirish</a>`;
        }
    }
}

// --------------------------------------------------------
// Modals & Miscellaneous
// --------------------------------------------------------
function initModals() {
    // Close buttons for modals
    $$('.modal-close, #success-close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
    
    // Top-up
    const topupBtn = $('#topup-btn');
    if (topupBtn) {
        topupBtn.addEventListener('click', () => {
            const modal = $('#topup-modal');
            if (modal) modal.style.display = 'block';
        });
    }
    
    const topupSubmit = $('#topup-submit-btn');
    if (topupSubmit) {
        topupSubmit.addEventListener('click', async () => {
            const amount = $('#topup-amount')?.value;
            if (amount >= 5000) {
                await apiCall('topup', 'POST', { amount });
                $('#topup-modal').style.display = 'none';
                showToast("Top-up request sent");
            }
        });
    }

    // Share Ref
    const shareRef = $('#share-ref-btn');
    if (shareRef) {
        shareRef.addEventListener('click', () => {
            const text = encodeURIComponent(`Join me on this amazing app!`);
            tg.openTelegramLink(`https://t.me/share/url?url=${text}`);
        });
    }

    // Eye button for password
    $$('.eye-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            const target = $(`#${targetId}`);
            if (target) {
                if (target.style.filter === 'blur(5px)') {
                    target.style.filter = 'none';
                } else {
                    target.style.filter = 'blur(5px)';
                }
            }
        });
    });
}

function openReceipt(order) {
    const modal = $('#receipt-modal');
    if (!modal) return;
    
    const details = $('#receipt-details');
    if (details) {
        details.innerHTML = `
            ID: ${order.id}<br>
            Amount: ${order.amount} UZS<br>
            Date: ${order.date}
        `;
    }
    
    const shareBtn = $('#receipt-share-btn');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const text = encodeURIComponent(`Receipt #${order.id} for ${order.amount} UZS`);
            tg.openTelegramLink(`https://t.me/share/url?url=${text}`);
        };
    }
    
    modal.style.display = 'block';
}
