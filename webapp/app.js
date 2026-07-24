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
        if (body) {
            const bodyObj = typeof body === 'object' ? { action, ...body } : body;
            options.body = JSON.stringify(bodyObj);
        }
        
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

    // Global copy button handler
    document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const val = copyBtn.getAttribute('data-copy');
            if (val) {
                navigator.clipboard.writeText(val).then(() => {
                    showToast(t('copied'));
                }).catch(() => {
                    // Fallback
                    const input = document.createElement('input');
                    input.value = val;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                    showToast(t('copied'));
                });
            }
        }
    });
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
            
            // Refresh profile or wishlist if switching to it
            if(targetId === 'page-profile' || targetId === 'page-subscriptions') {
                fetchProfile();
            } else if(targetId === 'page-wishlist') {
                renderWishlist();
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
    const langBtn = $('#lang-toggle');
    if (langBtn) {
        langBtn.textContent = state.lang.toUpperCase();
        langBtn.onclick = () => {
            state.lang = state.lang === 'uz' ? 'ru' : 'uz';
            localStorage.setItem('lang', state.lang);
            langBtn.textContent = state.lang.toUpperCase();
            applyLanguageTexts();
        };
    }
}

function applyLanguageTexts() {
    $$('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        el.textContent = t(key);
    });
    if ($('#search-input')) $('#search-input').placeholder = t('search_ph');
}

// --------------------------------------------------------
// Catalog Logic
// --------------------------------------------------------
async function fetchCatalog() {
    showSkeleton();
    const res = await apiCall('catalog');
    hideSkeleton();
    
    if (res.ok) {
        state.catalog = res.plans || [];
        renderCatalog();
        renderCarousel();
    } else {
        showToast(res.error || "Katalog yuklanmadi");
    }
}

function showSkeleton() {
    const sk = $('#catalog-skeleton');
    if(sk) {
        sk.innerHTML = Array(4).fill('<div class="skeleton-card"></div>').join('');
        sk.classList.remove('hidden');
    }
    const content = $('#catalog-content');
    if(content) content.classList.add('hidden');
}

function hideSkeleton() {
    const sk = $('#catalog-skeleton');
    if(sk) sk.classList.add('hidden');
    const content = $('#catalog-content');
    if(content) content.classList.remove('hidden');
}

function renderCatalog() {
    const content = $('#catalog-content');
    if (!content) return;
    
    let plans = [...state.catalog];
    
    // Search Filter
    if (state.searchQuery) {
        plans = plans.filter(p => p.name.toLowerCase().includes(state.searchQuery.toLowerCase()));
    }
    
    // Sort Filter
    if (state.sortMode === 'arzonroq') plans.sort((a,b) => a.price - b.price);
    else if (state.sortMode === 'qimmatroq') plans.sort((a,b) => b.price - a.price);
    else if (state.sortMode === 'yangi') plans.sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    
    if (plans.length === 0) {
        content.innerHTML = '<p style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 32px;">Mahsulotlar topilmadi</p>';
        return;
    }
    
    content.innerHTML = plans.map(p => {
        const isWish = state.wishlist.includes(p.id);
        return `
            <div class="plan-card" onclick="openProductDetail('${p.id}')">
                <button class="wishlist-heart ${isWish ? 'active' : ''}" onclick="event.stopPropagation(); toggleWishlist('${p.id}')">❤️</button>
                <div class="plan-name">${p.name}</div>
                <div class="plan-price">${p.price?.toLocaleString()} UZS</div>
            </div>
        `;
    }).join('');
}

function renderCarousel() {
    const carousel = $('#carousel-banner');
    if (!carousel) return;
    
    const topPlans = state.catalog.slice(0, 3);
    if(topPlans.length === 0) return;
    
    carousel.innerHTML = topPlans.map(p => `
        <div class="carousel-item" onclick="openProductDetail('${p.id}')">
            <h3>🔥 ${p.name}</h3>
            <p>${p.price?.toLocaleString()} UZS / oy</p>
        </div>
    `).join('');
}

function initSearchAndSort() {
    const search = $('#search-input');
    if (search) {
        search.oninput = (e) => {
            state.searchQuery = e.target.value;
            renderCatalog();
        };
    }
    
    $$('.sort-btn').forEach(btn => {
        btn.onclick = (e) => {
            $$('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const text = btn.textContent.toLowerCase();
            state.sortMode = text;
            renderCatalog();
        };
    });
}

function toggleWishlist(planId) {
    const idx = state.wishlist.indexOf(planId);
    if (idx > -1) {
        state.wishlist.splice(idx, 1);
    } else {
        state.wishlist.push(planId);
    }
    localStorage.setItem('wishlist', JSON.stringify(state.wishlist));
    renderCatalog();
    renderWishlist();
    apiCall('toggle_wishlist', 'POST', { planId });
}

// --------------------------------------------------------
// Product Detail & Checkout Modals
// --------------------------------------------------------
function openProductDetail(planId) {
    const plan = state.catalog.find(p => p.id === planId);
    if (!plan) return;
    
    state.cart = plan;
    
    $('#pd-name').textContent = plan.name;
    $('#pd-desc').textContent = plan.description || "Yuqori sifatli rasmiy obuna xizmati.";
    
    const wishBtn = $('#pd-wishlist-btn');
    if (wishBtn) {
        wishBtn.onclick = () => toggleWishlist(plan.id);
    }
    
    const buyBtn = $('#pd-buy-btn');
    if (buyBtn) {
        buyBtn.onclick = () => {
            $('#product-detail-modal').classList.remove('show');
            openCheckoutModal(plan);
        };
    }
    
    $('#product-detail-modal').classList.add('show');
}

function initModals() {
    $$('.modal-overlay, .drag-handle').forEach(el => {
        el.onclick = () => {
            $$('.modal').forEach(m => m.classList.remove('show'));
        };
    });
    
    const closeSuccess = $('#success-close-btn');
    if (closeSuccess) {
        closeSuccess.onclick = () => $('#success-modal').classList.remove('show');
    }
}

function openCheckoutModal(plan) {
    let finalPrice = plan.price;
    
    $('#checkout-summary').textContent = `${plan.name} - ${plan.price} UZS`;
    $('#checkout-final-price').textContent = `${finalPrice.toLocaleString()} UZS`;
    if ($('#checkout-current-balance')) {
        $('#checkout-current-balance').textContent = `${(state.balance || 0).toLocaleString()} UZS`;
    }
    
    if ($('#checkout-card')) {
        const rawCard = String(state.cardNumber || '8600000000000000').replace(/\s+/g, '');
        const formattedCard = rawCard.replace(/(.{4})/g, '$1 ').trim();
        $('#checkout-card').textContent = formattedCard;
        const copyBtn = $('#checkout-copy-btn');
        if (copyBtn) copyBtn.setAttribute('data-copy', rawCard);
    }
    
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
            $('#checkout-final-price').textContent = `${finalPrice.toLocaleString()} UZS`;
        };
    }

    // Promo Code Application
    const promoBtn = $('#promo-apply-btn');
    if (promoBtn) {
        promoBtn.onclick = async () => {
            const codeInput = $('#promo-code');
            const code = codeInput ? codeInput.value.trim() : '';
            if (!code) {
                showToast("Promokod kiritilmadi");
                return;
            }
            promoBtn.textContent = '...';
            const res = await apiCall('apply_promo', 'POST', { code });
            promoBtn.textContent = "Qo'llash";
            if (res.ok && res.promo) {
                const promo = res.promo;
                let discount = 0;
                if (promo.discount_type === 'percent') {
                    discount = Math.floor(plan.price * Number(promo.discount_value || 0) / 100);
                } else {
                    discount = Number(promo.discount_value || 0);
                }
                finalPrice = Math.max(0, plan.price - discount);
                $('#checkout-final-price').textContent = `${finalPrice.toLocaleString()} UZS (${discount.toLocaleString()} UZS chegirma)`;
                showToast(`Promokod qo'llandi! -${discount.toLocaleString()} UZS 🎉`);
            } else {
                showToast(res.error || "Yaroqsiz promokod ❌");
            }
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
    if (eyeBtn) {
        eyeBtn.onclick = () => {
            const pwd = $('#success-password');
            pwd.classList.toggle('obscured');
        };
    }
}

function fireConfetti() {
    const canvas = $('#confetti-canvas');
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
        state.cardNumber = res.cardNumber || '8600 0000 0000 0000';
        
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
    
    if ($('#user-balance')) $('#user-balance').textContent = `${(state.balance || 0).toLocaleString()} UZS`;
    if ($('#stat-purchases')) $('#stat-purchases').textContent = state.stats.totalPurchases || 0;
    if ($('#stat-saved')) $('#stat-saved').textContent = (state.stats.totalSaved || 0).toLocaleString() + ' UZS';
    if ($('#stat-active')) $('#stat-active').textContent = state.stats.activeSubscriptions || 0;

    renderFAQ();
}

function renderFAQ() {
    const faqContainer = $('#faq-list');
    if (!faqContainer) return;

    const faqItems = [
        {
            q: "1. Obuna vaqti va turi qanday?",
            a: "Hozircha faqat CapCut Pro obunasi mavjud. To'lov amalga oshirilgach, 1 daqiqa ichida avtomatik tarzda login va parol taqdim etiladi. (Kelgusida boshqa ilovalar ham qo'shiladi)."
        },
        {
            q: "2. Login va parolni qayerdan olaman?",
            a: "To'lov muvaffaqiyatli amalga oshirilgach, hisob ma'lumotlari Profil bo'limidagi \"Mening Obunalarim\" sahifasida va Telegram botimiz orqali bildirishnoma sifatida yuboriladi."
        },
        {
            q: "3. Balansni to'ldirish tartibi va minimal summa qancha?",
            a: "Balansni istalgan internet-banking (Click, Payme, Paynet) ilovalaridan to'ldirish mumkin. Muhimi — to'ldirishda qo'llanmaga rioya qilish. Minimal to'ldirish summasi: 5 000 UZS."
        },
        {
            q: "4. Promokoddan qanday foydalanaman?",
            a: "To'lov sahifasida \"Promokod kiritish\" maydoniga kodingizni yozib, \"Qo'llash\" tugmasini bosing. Chegirma avtomatik tarzda umumiy summadan chegiriladi."
        },
        {
            q: "5. Obunani uzaytirish va ogohlantirishlar qanday ishlaydi?",
            a: "Obuna tugashidan 3 kun va 1 kun avval sizga maxsus xabar keladi. O'zingizga qulay vaqtda obunani qayta sotib olishingiz mumkin."
        },
        {
            q: "6. Biror muammo yuzaga kelsa kimga murojaat qilishim kerak?",
            a: "Bot hozircha beta-test rejimida ishlayotgani sababli noodatiy xatoliklar bo'lishi tabiiy. Biror muammo yuzaga kelsa, bevosita bot egasiga — @santyx ga murojaat qilishingiz mumkin, muammo darhol hal etiladi."
        }
    ];

    faqContainer.innerHTML = faqItems.map((item, idx) => `
        <div class="faq-item" style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 12px 16px; margin-bottom: 8px; cursor: pointer;" onclick="toggleFAQ(${idx})">
            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 14px;">
                <span>${item.q}</span>
                <span id="faq-icon-${idx}">+</span>
            </div>
            <div id="faq-ans-${idx}" style="display: none; margin-top: 8px; font-size: 13px; opacity: 0.8; line-height: 1.5; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;">
                ${item.a}
            </div>
        </div>
    `).join('');
}

window.toggleFAQ = function(idx) {
    const ans = $(`#faq-ans-${idx}`);
    const icon = $(`#faq-icon-${idx}`);
    if (ans) {
        const isHidden = ans.style.display === 'none';
        ans.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.textContent = isHidden ? '-' : '+';
    }
};

function renderWishlist() {
    const cont = $('#wishlist-content');
    if (!cont) return;

    const likedPlans = state.catalog.filter(p => state.wishlist.includes(p.id));
    if (likedPlans.length === 0) {
        cont.innerHTML = '<p style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 32px;">Hozircha saralangan mahsulotlar yo\'q ❤️</p>';
        return;
    }

    cont.innerHTML = likedPlans.map(p => `
        <div class="plan-card" onclick="openProductDetail('${p.id}')">
            <button class="wishlist-heart active" onclick="event.stopPropagation(); toggleWishlist('${p.id}')">❤️</button>
            <div class="plan-name">${p.name}</div>
            <div class="plan-price">${p.price?.toLocaleString()} UZS</div>
        </div>
    `).join('');
}

function renderSubscriptions() {
    const activeCont = $('#active-subs');
    const archCont = $('#archived-subs');
    if (!activeCont || !archCont) return;
    
    const active = state.subscriptions.filter(s => s.status === 'active');
    const archived = state.subscriptions.filter(s => s.status !== 'active');
    
    activeCont.innerHTML = active.map(s => `
        <div class="sub-card" style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 16px; margin-bottom: 12px;">
            <h4>${s.plan_name || 'CapCut Pro Obunasi'}</h4>
            <p style="font-size: 13px; opacity: 0.8; margin: 4px 0 12px 0;">Tugash sanasi: ${s.end_date || s.expires_at || 'Amalda'}</p>
            <button class="action-btn" onclick="openProductDetail('${s.plan_id}')">${t('renew')}</button>
        </div>
    `).join('') || '<p style="opacity: 0.6; padding: 12px 0;">Faol obunalar yo\'q</p>';
    
    archCont.innerHTML = archived.map(s => `
        <div class="sub-card" style="opacity: 0.7; background: rgba(255,255,255,0.03); padding: 16px; border-radius: 16px; margin-bottom: 12px;">
            <h4>${s.plan_name || 'Obuna'}</h4>
            <p style="font-size: 13px; opacity: 0.6; margin: 4px 0 12px 0;">Tugagan</p>
            <button class="secondary-btn" onclick="openProductDetail('${s.plan_id}')">${t('reactivate')}</button>
        </div>
    `).join('') || '<p style="opacity: 0.6; padding: 12px 0;">Arxiv bo\'sh</p>';
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
                showToast("Minimal summa 5000 UZS");
                return;
            }
            topupSubmit.textContent = '...';
            topupSubmit.disabled = true;
            
            const res = await apiCall('topup', 'POST', { amount });
            topupSubmit.textContent = state.lang === 'uz' ? 'Tasdiqlash' : 'Подтвердить';
            topupSubmit.disabled = false;
            
            if (res.ok) {
                $('#topup-modal').classList.remove('show');
                
                // Populate Top-Up instructions sheet
                const rawCard = String(res.cardNumber || state.cardNumber || '8600000000000000').replace(/\s+/g, '');
                const formattedCard = rawCard.replace(/(.{4})/g, '$1 ').trim();
                
                if ($('#topup-card-number')) $('#topup-card-number').textContent = formattedCard;
                if ($('#topup-card-copy-btn')) $('#topup-card-copy-btn').setAttribute('data-copy', rawCard);
                
                if ($('#topup-unique-amount')) $('#topup-unique-amount').textContent = `${(res.uniqueAmount || amount).toLocaleString()} UZS`;
                if ($('#topup-amount-copy-btn')) $('#topup-amount-copy-btn').setAttribute('data-copy', String(res.uniqueAmount || amount));
                
                $('#topup-pay-modal').classList.add('show');
                $('#topup-amount').value = '';
            } else {
                showToast(res.error || "API Xatolik yuz berdi");
            }
        };
    }

    const topupDoneBtn = $('#topup-done-btn');
    if (topupDoneBtn) {
        topupDoneBtn.onclick = () => {
            $('#topup-pay-modal').classList.remove('show');
            showToast("To'lov so'rovi qabul qilindi 🚀");
        };
    }
    
    const shareBtn = $('#share-ref-btn');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const userId = tg.initDataUnsafe?.user?.id || '0';
            const text = encodeURIComponent(state.lang === 'uz' ? "Santyx Digital Store obunalar do'koni:" : "Santyx Digital Store - магазин подписок:");
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