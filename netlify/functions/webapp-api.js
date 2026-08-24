const {
  getAdminClient,
  request,
  upsertUser,
  fetchSettings,
  createCartItem,
  listCartItems,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  validatePromoCode,
  getUserBalance,
  createCheckoutOrder,
  setUserAwaitingReceipt,
  addWalletTransaction,
  getOrderById,
  getOrderItems,
  getInventoryItemById,
  createOrder,
  generateUniquePrice,
  expireOrder,
  createLead,
} = require('../../shared/db');
const {
  processApprovedOrderDelivery,
  resolveAutoAccount,
  resolveLicenseKey,
} = require('../../shared/delivery-service');
const { authenticate, signJwt } = require('../../shared/webapp-auth');
const { verifyWebLoginCode } = require('../../shared/web-auth-service');
const rateLimit = require('../../shared/rate-limit');
const { sendMessage } = require('../../shared/telegram');
const { escapeHtml } = require('../../shared/messages');

const PAYMENT_WARN_SUPPORT = (process.env.SUPPORT_USERNAME || '@santyx').replace(/^@?/, '@');

function cardNumber(settings) {
  return settings?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '';
}

// Admin Telegram chat ID larini sozlama va env dan yig'adi.
function adminChatIds(settings) {
  return [
    ...new Set(
      [
        settings?.admin_telegram_id,
        process.env.ADMIN_CHAT_ID,
        process.env.ADMIN_TELEGRAM_ID,
        ...(process.env.ADMIN_TELEGRAM_IDS || '').split(','),
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  ];
}

// Yetkazilgan buyurtma elementlaridan kredensiallarni (deshifrlangan) chiqaradi.
async function collectDeliveries(supabase, orderId) {
  const items = await getOrderItems(supabase, orderId);
  const out = [];
  for (const it of items) {
    const plan = it.plan;
    const dtype = plan?.delivery_type || 'manual';
    let credential = null;
    if (it.inventory_item_id) {
      const inv = await getInventoryItemById(supabase, it.inventory_item_id).catch(() => null);
      if (inv && dtype === 'auto_account') {
        const { login, password } = resolveAutoAccount(inv);
        if (login || password) credential = { type: 'account', login, password };
      } else if (inv && dtype === 'license_key') {
        const key = resolveLicenseKey(inv);
        if (key) credential = { type: 'key', key };
      }
    }
    if (!credential && dtype === 'instruction_only') {
      credential = { type: 'instruction', text: plan?.deliveryInstructions || '' };
    }
    out.push({ plan_name: plan?.name || '', delivery_type: dtype, credential });
  }
  return out;
}

// Mini App (React) uchun asosiy API.
// Har bir so'rov Telegram initData (X-Telegram-Init-Data header) bilan tasdiqlanadi.

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

// Telefon raqamni tozalaydi va oddiy tekshiruvdan o'tkazadi.
function sanitizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}

function extractPhoneFromRaw(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return (
    raw?.responseUnsafe?.contact?.contact?.phone_number ||
    raw?.response?.contact?.phone_number ||
    raw?.contact?.phone_number ||
    null
  );
}

const AUTO_DELIVERY = ['auto_account', 'license_key'];

// Bitta plan qatorini frontend uchun mahsulot obyektiga aylantiradi.
// Teglar bazada jsonb massiv yoki vergul bilan ajratilgan matn bo'lishi mumkin —
// ikkalasini ham massivga keltiramiz (qidiruv teglar bo'yicha ham ishlaydi).
function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function productShape(row, { stock, inStock, rating }) {
  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    description: row.description || '',
    tags: normalizeTags(row.tags),
    price: Number(row.price || 0),
    old_price: row.old_price != null ? Number(row.old_price) : null,
    currency: row.currency || 'UZS',
    duration: row.duration || '',
    image_url: row.image_url || null,
    is_popular: Boolean(row.is_popular),
    delivery_type: row.delivery_type || 'manual',
    stock,
    in_stock: inStock,
    rating,
  };
}

// Sharhlar ro'yxatidan {plan_id: {avg, count}} xaritasini quradi.
function aggregateRatings(reviews) {
  const map = {};
  for (const r of reviews) {
    const m = map[r.plan_id] || (map[r.plan_id] = { sum: 0, count: 0 });
    m.sum += Number(r.rating || 0);
    m.count += 1;
  }
  const out = {};
  for (const [id, m] of Object.entries(map)) {
    out[id] = { avg: m.count ? Math.round((m.sum / m.count) * 10) / 10 : 0, count: m.count };
  }
  return out;
}

async function availableStockByPlan(supabase) {
  const { data } = await request(supabase, 'inventory_items', {
    query: 'select=plan_id&status=eq.available',
  });
  const map = {};
  for (const it of data || []) map[it.plan_id] = (map[it.plan_id] || 0) + 1;
  return map;
}

function reviewShape(row) {
  return {
    id: row.id,
    rating: Number(row.rating || 0),
    text: row.text || '',
    admin_reply: row.admin_reply || null,
    user_name: row.user_name || null,
    created_at: row.created_at,
  };
}

// Foydalanuvchining muddati o'tgan tugallanmagan to'lovlarini "expired" ga o'tkazadi.
// Mini App har ochilganda (init) chaqiriladi — shunda "Kutilmoqda" holatda
// osilib qolgan buyurtma tarixda "Rad etilgan" bo'lib ko'rinadi.
async function expireStalePendingOrders(supabase, telegramId) {
  try {
    const now = new Date().toISOString();
    const { data } = await request(supabase, 'orders', {
      query: `select=*&user_telegram_id=eq.${telegramId}&status=in.(waiting_payment,pending_payment)&expires_at=lt.${encodeURIComponent(now)}`,
    });
    for (const order of data || []) {
      await expireOrder(supabase, order).catch((e) => console.warn('expireOrder warn:', e?.message));
    }
  } catch (e) {
    console.warn('expireStalePendingOrders warn:', e?.message);
  }
}

// Buyurtma holatini foydalanuvchi uchun 3 toifaga keltiradi.
function statusCategory(s) {
  if (['completed', 'approved'].includes(s)) return 'confirmed';
  if (['cancelled', 'rejected', 'expired', 'failed'].includes(s)) return 'cancelled';
  return 'waiting';
}

// Brauzer (Landing page) uchun auth TALAB QILMAYDIGAN katalog.
// Faqat faol mahsulotlar; foydalanuvchiga xos ma'lumot (wishlist/savat) YO'Q.
async function handlePublicCatalog(supabase) {
  const [categoriesRes, plansRes, reviewsRes] = await Promise.all([
    request(supabase, 'categories', {
      query: 'select=id,name,button_label,sort_order&is_active=eq.true&order=sort_order.asc,created_at.asc',
    }).catch(() => ({ data: [] })),
    request(supabase, 'plans', {
      query: 'select=*&is_active=eq.true&order=sort_order.asc,created_at.asc',
    }),
    request(supabase, 'reviews', { query: 'select=plan_id,rating&is_hidden=eq.false&status=neq.rejected' })
      .catch(() => request(supabase, 'reviews', { query: 'select=plan_id,rating&is_hidden=eq.false' }).catch(() => ({ data: [] }))),
  ]);

  const plans = plansRes.data || [];
  const ratingMap = aggregateRatings(reviewsRes.data || []);
  const stockMap = await availableStockByPlan(supabase).catch(() => ({}));

  const parentIds = new Set(plans.map((p) => p.parent_plan_id).filter(Boolean));
  const products = plans
    .filter((p) => !parentIds.has(p.id))
    .map((p) => {
      const auto = AUTO_DELIVERY.includes(p.delivery_type);
      const stock = auto ? stockMap[p.id] || 0 : null;
      const inStock = auto ? stock > 0 : true;
      return productShape(p, { stock, inStock, rating: ratingMap[p.id] || { avg: 0, count: 0 } });
    });

  return json(200, {
    ok: true,
    categories: (categoriesRes.data || []).map((c) => ({ id: c.id, name: c.button_label || c.name, sort_order: c.sort_order })),
    products,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const supabase = getAdminClient();

  // ---- Public amallar (auth talab qilinmaydi — brauzer Landing/login uchun) ----
  if (body.action === 'public-catalog') {
    try {
      return await handlePublicCatalog(supabase);
    } catch (error) {
      console.error('public-catalog error', error);
      return json(500, { ok: false, error: 'server_error' });
    }
  }
  if (body.action === 'verify-web-code') {
    // Kod 4 xonali (9 000 variant) — himoya to'liq shu chegaralarda, shuning
    // uchun ikkalasida ham failClosed: baza javob bermasa tekshiruv yopiladi
    // (kod qidiruvi baribir o'sha bazada, demak bunda yo'qotish yo'q).
    const ip = rateLimit.clientIp(event.headers);
    // 1) IP boshiga: 10 daqiqada 5 ta urinish, oshsa 30 daqiqa blok.
    let gate = await rateLimit.hit(supabase, {
      scope: 'web_code',
      key: ip,
      limit: 5,
      windowSeconds: 600,
      blockSeconds: 1800,
      failClosed: true,
    });
    // 2) Umumiy to'siq: hujumchi IP larni aylantirsa per-IP chegara ojiz —
    // barcha IP lar yig'indisi 10 daqiqada 80 tadan oshsa tekshiruv 15
    // daqiqaga to'liq yopiladi. Halol trafik (kuniga o'nlab kirish) bunga
    // yaqinlashmaydi; ataylab yopdirishga urinish esa faqat sayt loginini
    // vaqtincha to'xtatadi — bot orqali xizmat ishlayveradi.
    if (gate.allowed) {
      gate = await rateLimit.hit(supabase, {
        scope: 'web_code_global',
        key: 'all',
        limit: 80,
        windowSeconds: 600,
        blockSeconds: 900,
        failClosed: true,
      });
    }
    if (!gate.allowed) {
      return json(
        429,
        { ok: false, error: 'too_many_attempts', retry_after: gate.retryAfter },
        { 'Retry-After': String(gate.retryAfter) },
      );
    }
    try {
      const result = await verifyWebLoginCode(supabase, body.code);
      if (!result.ok) return json(400, { ok: false, error: result.reason });
      // To'g'ri kod — IP hisoblagichi tozalanadi, halol foydalanuvchi
      // jazolanmasin. Umumiy to'siq ataylab tozalanmaydi: muvaffaqiyatlar
      // taqsimlangan hujum statistikasini o'chirib yubormasligi kerak.
      await rateLimit.reset(supabase, 'web_code', ip);
      const token = signJwt({ telegram_id: result.telegram_id });
      return json(200, { ok: true, token, telegram_id: result.telegram_id });
    } catch (error) {
      console.error('verify-web-code error', error);
      return json(500, { ok: false, error: 'server_error' });
    }
  }
  // Landing lead formasi — auth talab qilinmaydi (tashrifchi login qilmagan).
  // Lead avval bazaga yoziladi, keyin adminlarga bot orqali xabar boradi;
  // baza yozuvi muvaffaqiyatsiz bo'lsa ham xabar ketadi (lead yo'qolmasin).
  if (body.action === 'submit-lead') {
    try {
      // Honeypot: oddiy foydalanuvchi bu maydonni ko'rmaydi va to'ldirmaydi.
      if (body.website) return json(200, { ok: true });

      // Spamga qarshi: bir IP dan soatiga 5 ta so'rov. Har bir lead adminga
      // Telegram xabari yuboradi, shuning uchun chegara kerak.
      const leadGate = await rateLimit.hit(supabase, {
        scope: 'lead',
        key: rateLimit.clientIp(event.headers),
        limit: 5,
        windowSeconds: 3600,
        blockSeconds: 3600,
      });
      if (!leadGate.allowed) {
        return json(
          429,
          { ok: false, error: 'too_many_requests', retry_after: leadGate.retryAfter },
          { 'Retry-After': String(leadGate.retryAfter) },
        );
      }
      const wanted = String(body.wanted || '').trim().slice(0, 300);
      const contact = String(body.contact || '').trim().slice(0, 120);
      const name = String(body.name || '').trim().slice(0, 120);
      if (!wanted || !contact) return json(400, { ok: false, error: 'required' });

      let saved = null;
      try {
        saved = await createLead(supabase, { wanted, contact, name });
      } catch (error) {
        console.error('lead save error', error?.message);
      }

      let notified = false;
      try {
        const settings = await fetchSettings(supabase).catch(() => null);
        const ids = new Set();
        if (settings?.admin_telegram_id) ids.add(String(settings.admin_telegram_id));
        if (process.env.ADMIN_CHAT_ID) ids.add(String(process.env.ADMIN_CHAT_ID));
        if (process.env.ADMIN_TELEGRAM_ID) ids.add(String(process.env.ADMIN_TELEGRAM_ID));
        (process.env.ADMIN_TELEGRAM_IDS || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((id) => ids.add(id));
        const text = [
          '📥 <b>Yangi lead!</b> (saytdagi forma)',
          '',
          `🔎 Izlayapti: ${escapeHtml(wanted)}`,
          `📞 Kontakt: ${escapeHtml(contact)}`,
          name ? `👤 Ism: ${escapeHtml(name)}` : null,
          '',
          saved ? 'Admin panel → Leadlar bo\'limida turibdi.' : '⚠️ Bazaga yozilmadi (leads jadvali yo\'q?) — bu xabarni yo\'qotmang!',
        ].filter((line) => line !== null).join('\n');
        const results = await Promise.allSettled([...ids].map((id) => sendMessage(id, text, null)));
        notified = results.some((r) => r.status === 'fulfilled');
      } catch (error) {
        console.warn('lead notify warn', error?.message);
      }

      if (!saved && !notified) return json(500, { ok: false, error: 'server_error' });
      return json(200, { ok: true });
    } catch (error) {
      console.error('submit-lead error', error);
      return json(500, { ok: false, error: 'server_error' });
    }
  }

  // ---- Autentifikatsiya: Telegram initData (Mini App) YOKI JWT (brauzer) ----
  const auth = authenticate(event.headers, body);
  if (!auth.ok) return json(401, { ok: false, error: 'unauthorized', reason: auth.reason });

  const isTelegramSource = auth.source === 'telegram';
  const tgUser = auth.user;
  const telegramId = String(tgUser.id);

  try {
    // Telegram manbadan kelganda foydalanuvchini yangilaymiz (JWT'da profil ma'lumoti yo'q).
    // Blok holati + profil ma'lumotini o'qishni parallel bajaramiz.
    const [, userRowRes] = await Promise.all([
      isTelegramSource
        ? upsertUser(supabase, tgUser).catch((e) => console.warn('upsertUser warn:', e?.message))
        : Promise.resolve(),
      request(supabase, 'users', {
        query: `select=phone,is_blocked,full_name,username,language_code,photo_url&telegram_id=eq.${telegramId}&limit=1`,
      }).catch((e) => {
        console.warn('user row read warn:', e?.message);
        return { data: [] };
      }),
    ]);
    const userRow = userRowRes?.data?.[0] || null;
    if (userRow?.is_blocked) {
      return json(403, { ok: false, error: 'blocked' });
    }

    // Ko'rsatish uchun foydalanuvchi obyekti: Telegram'da to'g'ridan-to'g'ri,
    // brauzerda (JWT) users jadvalidagi ma'lumotdan quramiz.
    const acctUser = isTelegramSource
      ? tgUser
      : {
          id: telegramId,
          first_name: (userRow?.full_name || '').trim().split(/\s+/)[0] || null,
          last_name: (userRow?.full_name || '').trim().split(/\s+/).slice(1).join(' ') || null,
          username: userRow?.username || null,
          language_code: userRow?.language_code || null,
          photo_url: userRow?.photo_url || null,
        };

    if (body.action === 'init') {
      // Muddati o'tgan tugallanmagan to'lovlarni avtomatik rad etamiz
      await expireStalePendingOrders(supabase, telegramId);
      const hasPhone = Boolean(userRow?.phone);
      return json(200, {
        ok: true,
        hasPhone,
        user: {
          id: telegramId,
          first_name: acctUser.first_name || null,
          last_name: acctUser.last_name || null,
          username: acctUser.username || null,
          language_code: acctUser.language_code || null,
        },
      });
    }

    if (body.action === 'save-contact') {
      const raw = body.phone || extractPhoneFromRaw(body.raw);
      const phone = sanitizePhone(raw);
      let saved = false;
      if (phone) {
        try {
          await request(supabase, 'users', {
            method: 'PATCH',
            query: `telegram_id=eq.${telegramId}`,
            body: { phone, updated_at: new Date().toISOString() },
          });
          saved = true;
        } catch (e) {
          console.warn('save phone warn:', e?.message);
        }
      }
      // Telefon topilmasa ham xato bermaymiz: requestContact kontaktni botga ham
      // yuboradi va webhook uni ushlab qoladi.
      return json(200, { ok: true, saved });
    }

    if (body.action === 'catalog') {
      const now = Date.now();

      const [bannersRes, categoriesRes, plansRes, reviewsRes, wishlistRes] = await Promise.all([
        request(supabase, 'banners', {
          query: 'select=id,title,subtitle,btn_text,image_url,link,gradient,expires_at&is_active=eq.true&order=sort_order.asc',
        }).catch(() =>
          request(supabase, 'banners', {
            query: 'select=id,title,image_url,link,expires_at&is_active=eq.true&order=sort_order.asc',
          }).catch(() => ({ data: [] })),
        ),
        request(supabase, 'categories', {
          query: 'select=id,name,button_label,sort_order&is_active=eq.true&order=sort_order.asc,created_at.asc',
        }),
        request(supabase, 'plans', {
          query: 'select=*&is_active=eq.true&order=sort_order.asc,created_at.asc',
        }),
        request(supabase, 'reviews', { query: 'select=plan_id,rating&is_hidden=eq.false&status=neq.rejected' })
          .catch(() => request(supabase, 'reviews', { query: 'select=plan_id,rating&is_hidden=eq.false' }).catch(() => ({ data: [] }))),
        request(supabase, 'wishlist', {
          query: `select=plan_id&user_telegram_id=eq.${telegramId}`,
        }).catch(() => ({ data: [] })),
      ]);

      const banners = (bannersRes.data || []).filter(
        (b) => !b.expires_at || new Date(b.expires_at).getTime() > now,
      );
      const plans = plansRes.data || [];
      const ratingMap = aggregateRatings(reviewsRes.data || []);
      const stockMap = await availableStockByPlan(supabase).catch(() => ({}));
      const wishlistIds = (wishlistRes.data || []).map((w) => w.plan_id);

      // Faqat "yaproq" rejalar (variantlari bo'lmagan) mahsulot sifatida ko'rsatiladi
      const parentIds = new Set(plans.map((p) => p.parent_plan_id).filter(Boolean));
      const products = plans
        .filter((p) => !parentIds.has(p.id))
        .map((p) => {
          const auto = AUTO_DELIVERY.includes(p.delivery_type);
          const stock = auto ? stockMap[p.id] || 0 : null;
          const inStock = auto ? stock > 0 : true;
          return productShape(p, {
            stock,
            inStock,
            rating: ratingMap[p.id] || { avg: 0, count: 0 },
          });
        });
      // Eslatma: stok tugagan mahsulotlar ham ko'rsatiladi (ProductCard "Tugagan"
      // disabled tugmani chiqaradi). Avval bu yerda .filter((p) => p.in_stock) bor edi.

      return json(200, {
        ok: true,
        banners,
        categories: (categoriesRes.data || []).map((c) => ({
          id: c.id,
          name: c.button_label || c.name,
          sort_order: c.sort_order,
        })),
        products,
        wishlist: wishlistIds,
      });
    }

    if (body.action === 'product') {
      const productId = body.productId;
      if (!productId) return json(400, { ok: false, error: 'no_product_id' });

      const { data: planRows } = await request(supabase, 'plans', {
        query: `select=*&id=eq.${productId}&limit=1`,
      });
      const p = planRows?.[0];
      if (!p) return json(404, { ok: false, error: 'not_found' });

      const [reviewsRes, wishRes, settings] = await Promise.all([
        request(supabase, 'reviews', {
          query: `select=id,rating,text,admin_reply,user_name,created_at&plan_id=eq.${productId}&is_hidden=eq.false&status=neq.rejected&order=created_at.desc`,
        }).catch(() =>
          request(supabase, 'reviews', {
            query: `select=id,rating,text,admin_reply,user_name,created_at&plan_id=eq.${productId}&is_hidden=eq.false&order=created_at.desc`,
          }).catch(() => ({ data: [] })),
        ),
        request(supabase, 'wishlist', {
          query: `select=id&user_telegram_id=eq.${telegramId}&plan_id=eq.${productId}&limit=1`,
        }).catch(() => ({ data: [] })),
        fetchSettings(supabase).catch(() => null),
      ]);

      const reviews = (reviewsRes.data || []).map(reviewShape);
      const rating = reviews.length
        ? {
            avg:
              Math.round(
                (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10,
              ) / 10,
            count: reviews.length,
          }
        : { avg: 0, count: 0 };

      const auto = AUTO_DELIVERY.includes(p.delivery_type);
      let stock = null;
      let inStock = true;
      if (auto) {
        const stockMap = await availableStockByPlan(supabase).catch(() => ({}));
        stock = stockMap[p.id] || 0;
        inStock = stock > 0;
      }

      return json(200, {
        ok: true,
        product: {
          ...productShape(p, { stock, inStock, rating }),
          warranty_text: p.warranty_text || '',
          rules_text: p.rules_text || '',
          how_it_works_text: p.how_it_works_text || '',
        },
        general_terms: settings?.general_terms || '',
        reviews,
        in_wishlist: Boolean(wishRes.data?.length),
      });
    }

    if (body.action === 'wishlist-toggle') {
      const productId = body.productId;
      if (!productId) return json(400, { ok: false, error: 'no_product_id' });

      const { data } = await request(supabase, 'wishlist', {
        query: `select=id&user_telegram_id=eq.${telegramId}&plan_id=eq.${productId}&limit=1`,
      });
      if (data?.[0]) {
        await request(supabase, 'wishlist', { method: 'DELETE', query: `id=eq.${data[0].id}` });
        return json(200, { ok: true, in_wishlist: false });
      }
      await request(supabase, 'wishlist', {
        method: 'POST',
        query: 'on_conflict=user_telegram_id,plan_id',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: { user_telegram_id: telegramId, plan_id: productId },
      });
      // "Narx tushdi" kuzatuvi uchun qo'shilgan paytdagi narxni yozamiz (best-effort).
      try {
        const { data: planRow } = await request(supabase, 'plans', {
          query: `select=price&id=eq.${productId}&limit=1`,
        });
        await request(supabase, 'wishlist', {
          method: 'PATCH',
          query: `user_telegram_id=eq.${telegramId}&plan_id=eq.${productId}`,
          body: { price_at_add: Number(planRow?.[0]?.price || 0) },
        });
      } catch {
        /* price_at_add ustuni hali yo'q bo'lishi mumkin — jiddiy emas */
      }
      return json(200, { ok: true, in_wishlist: true });
    }

    if (body.action === 'add-review') {
      const productId = body.productId;
      const rating = Math.round(Number(body.rating || 0));
      const text = String(body.text || '').trim().slice(0, 1000);
      if (!productId) return json(400, { ok: false, error: 'no_product_id' });
      if (!(rating >= 1 && rating <= 5)) return json(400, { ok: false, error: 'bad_rating' });

      const orderId = body.orderId || null;
      const userName = acctUser.first_name || 'Foydalanuvchi';
      // on_conflict=(plan_id,user_telegram_id) — bir foydalanuvchi bir reja uchun bitta sharh
      // (qayta yuborilsa yangilanadi) => amalda "buyurtma uchun 1 ta sharh" cheklovi.
      const reviewBody = {
        plan_id: productId,
        user_telegram_id: telegramId,
        user_name: userName,
        rating,
        text,
        updated_at: new Date().toISOString(),
      };
      if (orderId) reviewBody.order_id = orderId;
      let data;
      try {
        ({ data } = await request(supabase, 'reviews', {
          method: 'POST',
          query: 'on_conflict=plan_id,user_telegram_id',
          headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
          body: reviewBody,
        }));
      } catch {
        // order_id ustuni hali qo'shilmagan bo'lishi mumkin — usiz qayta urinamiz
        delete reviewBody.order_id;
        ({ data } = await request(supabase, 'reviews', {
          method: 'POST',
          query: 'on_conflict=plan_id,user_telegram_id',
          headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
          body: reviewBody,
        }));
      }

      // Adminга Telegram xabari (best-effort — sharhni bloklamaydi)
      try {
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const who = acctUser.username ? `@${acctUser.username}` : userName;
        const settings = await fetchSettings(supabase).catch(() => null);
        const admins = adminChatIds(settings);
        const msg = `⭐ Yangi sharh (${rating}/5): ${esc(who)}${text ? ` — ${esc(text)}` : ''}`;
        await Promise.all(admins.map((id) => sendMessage(id, msg, null).catch(() => {})));
      } catch {
        /* ignore */
      }

      return json(200, { ok: true, review: data?.[0] ? reviewShape(data[0]) : null });
    }

    if (body.action === 'cart-add') {
      const productId = body.productId;
      const qty = Math.min(5, Math.max(1, Math.round(Number(body.quantity || 1))));
      if (!productId) return json(400, { ok: false, error: 'no_product_id' });

      let current = 0;
      try {
        const { data } = await request(supabase, 'cart_items', {
          query: `select=quantity&user_telegram_id=eq.${telegramId}&plan_id=eq.${productId}&limit=1`,
        });
        current = Number(data?.[0]?.quantity || 0);
      } catch {
        /* yangi element */
      }
      const newQty = Math.min(5, current + qty);
      await createCartItem(supabase, {
        user_telegram_id: telegramId,
        plan_id: productId,
        quantity: newQty,
      });

      let cartCount = 0;
      try {
        const items = await listCartItems(supabase, telegramId);
        cartCount = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
      } catch {
        /* ignore */
      }
      return json(200, { ok: true, cartCount, quantity: newQty });
    }

    if (body.action === 'cart-count') {
      let cartCount = 0;
      try {
        const items = await listCartItems(supabase, telegramId);
        cartCount = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
      } catch {
        /* ignore */
      }
      return json(200, { ok: true, cartCount });
    }

    if (body.action === 'cart') {
      const [items, wallet, settings] = await Promise.all([
        listCartItems(supabase, telegramId),
        getUserBalance(supabase, telegramId).catch(() => ({ balance: 0 })),
        fetchSettings(supabase).catch(() => null),
      ]);
      const mapped = (items || [])
        .filter((i) => i.plan)
        .map((i) => ({
          id: i.id,
          plan_id: i.plan_id,
          name: i.plan.name,
          image_url: i.plan.image_url || null,
          price: Number(i.plan.price || 0),
          old_price: i.plan.old_price != null ? Number(i.plan.old_price) : null,
          currency: i.plan.currency || 'UZS',
          quantity: Number(i.quantity || 1),
          rules: i.plan.rulesText || '',
        }));
      return json(200, {
        ok: true,
        items: mapped,
        balance: Number(wallet?.balance || 0),
        card_number: cardNumber(settings),
        general_terms: settings?.general_terms || '',
      });
    }

    if (body.action === 'cart-update') {
      const { itemId, quantity } = body;
      if (!itemId) return json(400, { ok: false, error: 'no_item_id' });
      const qty = Math.min(5, Math.max(1, Math.round(Number(quantity || 1))));
      await updateCartItemQuantity(supabase, itemId, qty);
      return json(200, { ok: true, quantity: qty });
    }

    if (body.action === 'cart-remove') {
      const { itemId } = body;
      if (!itemId) return json(400, { ok: false, error: 'no_item_id' });
      await removeCartItem(supabase, itemId);
      return json(200, { ok: true });
    }

    if (body.action === 'promo-validate') {
      const code = String(body.code || '').trim();
      if (!code) return json(400, { ok: false, error: 'no_code' });
      const items = await listCartItems(supabase, telegramId);
      const basePrice = (items || []).reduce(
        (s, i) => s + Number(i.plan?.price || 0) * Number(i.quantity || 1),
        0,
      );
      // Promokod tanlangan tovarlarga bog'langan bo'lishi mumkin — savatdagi
      // rejalar ro'yxatini uzatamiz.
      const planIds = (items || []).map((i) => i.plan?.id).filter(Boolean);
      const result = await validatePromoCode(supabase, code, basePrice, planIds);
      if (!result.ok) return json(200, { ok: true, valid: false, reason: result.reason });
      return json(200, {
        ok: true,
        valid: true,
        code: result.promo.code,
        discount: result.discount,
        cashback: result.cashback || 0,
        discount_type: result.promo.discount_type,
        discount_value: Number(result.promo.discount_value),
      });
    }

    if (body.action === 'checkout') {
      const items = await listCartItems(supabase, telegramId);
      const cartItems = (items || []).filter((i) => i.plan);
      if (!cartItems.length) return json(400, { ok: false, error: 'empty_cart' });

      const basePrice = cartItems.reduce(
        (s, i) => s + Number(i.plan.price || 0) * Number(i.quantity || 1),
        0,
      );

      // Promo tekshirish
      let promo = null;
      let discount = 0;
      let cashback = 0;
      if (body.promoCode) {
        const res = await validatePromoCode(
          supabase,
          String(body.promoCode).trim(),
          basePrice,
          cartItems.map((i) => i.plan.id).filter(Boolean),
        );
        if (res.ok) {
          promo = res.promo;
          discount = res.discount;
          cashback = res.cashback || 0;
        }
      }

      // Balans (server hisoblaydi)
      let balanceUsed = 0;
      if (body.useBalance) {
        const wallet = await getUserBalance(supabase, telegramId).catch(() => ({ balance: 0 }));
        const payableAfterPromo = Math.max(0, basePrice - discount);
        balanceUsed = Math.min(Number(wallet?.balance || 0), payableAfterPromo);
      }

      const order = await createCheckoutOrder(supabase, {
        user_telegram_id: telegramId,
        items: cartItems,
        promo,
        balanceUsed,
        cashbackAmount: cashback,
        expiresMinutes: Number(process.env.WEBAPP_CHECKOUT_MINUTES || 10),
      });

      // Reserved inventory OLIB TASHLANDI — checkout inventarni band qilmaydi.
      // Stock faqat to'lov tasdiqlangach tekshiriladi (processApprovedOrderDelivery).
      await setUserAwaitingReceipt(supabase, telegramId, { current_order_id: order.id }).catch(
        () => {},
      );
      await clearCart(supabase, telegramId).catch(() => {});

      const fullyCovered = Number(order.unique_price || 0) <= 0;

      // To'liq balansdan to'langan bo'lsa — hoziroq yechamiz va yetkazamiz
      if (fullyCovered && balanceUsed > 0) {
        await addWalletTransaction(supabase, {
          user_telegram_id: telegramId,
          order_id: order.id,
          amount: balanceUsed,
          type: 'debit',
          description: `Balansdan to'liq to'landi #${order.order_number}`,
        }).catch((e) => console.warn('debit warn:', e?.message));
        await processApprovedOrderDelivery({
          supabase,
          order,
          adminTelegramId: 'webapp_balance',
        }).catch((e) => console.warn('deliver warn:', e?.message));
      }

      const settings = await fetchSettings(supabase).catch(() => null);
      return json(200, {
        ok: true,
        order_id: order.id,
        order_number: order.order_number,
        base_price: Number(order.base_price || basePrice),
        discount,
        cashback,
        balance_used: balanceUsed,
        amount: Number(order.unique_price || 0),
        card_number: cardNumber(settings),
        support: PAYMENT_WARN_SUPPORT,
        expires_at: order.expires_at,
        fully_paid: fullyCovered,
      });
    }

    if (body.action === 'profile') {
      const lang = body.lang || 'uz';
      const BOT = process.env.BOT_USERNAME || 'santyxnarxbot';
      const [wallet, settings, userRes, subsRes, txRes, refRes, faqRes] = await Promise.all([
        getUserBalance(supabase, telegramId).catch(() => ({ balance: 0 })),
        fetchSettings(supabase).catch(() => null),
        request(supabase, 'users', {
          query: `select=phone,birthday,photo_url&telegram_id=eq.${telegramId}&limit=1`,
        }).catch(() => ({ data: [] })),
        request(supabase, 'subscriptions', {
          query: `select=plan_name,expires_at,status&user_telegram_id=eq.${telegramId}&status=eq.active&order=expires_at.asc`,
        }).catch(() => ({ data: [] })),
        request(supabase, 'wallet_transactions', {
          query: `select=amount,type,description,created_at&user_telegram_id=eq.${telegramId}&order=created_at.desc&limit=20`,
        }).catch(() => ({ data: [] })),
        request(supabase, 'referrals', {
          query: `select=status,total_earned&referrer_telegram_id=eq.${telegramId}`,
        }).catch(() =>
          request(supabase, 'referrals', {
            query: `select=status,reward_value&referrer_telegram_id=eq.${telegramId}`,
          }).catch(() => ({ data: [] })),
        ),
        request(supabase, 'faq', {
          query: 'select=id,question,answer,lang,sort_order&is_active=eq.true&order=sort_order.asc',
        }).catch(() => ({ data: [] })),
      ]);

      const now = Date.now();
      const subscriptions = (subsRes.data || [])
        .filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now)
        .map((s) => {
          const daysLeft = s.expires_at
            ? Math.ceil((new Date(s.expires_at).getTime() - now) / 86400000)
            : null;
          return {
            plan_name: s.plan_name,
            expires_at: s.expires_at,
            days_left: daysLeft,
            warn: daysLeft != null && daysLeft <= 3,
          };
        });

      const refs = refRes.data || [];
      const u = userRes.data?.[0] || {};
      const faq = (faqRes.data || [])
        .filter((f) => !f.lang || f.lang === lang)
        .map((f) => ({ id: f.id, question: f.question, answer: f.answer }));

      return json(200, {
        ok: true,
        user: {
          first_name: acctUser.first_name || null,
          last_name: acctUser.last_name || null,
          username: acctUser.username || null,
          phone: u.phone || null,
          birthday: u.birthday || null,
          photo_url: u.photo_url || acctUser.photo_url || null,
        },
        balance: Number(wallet?.balance || 0),
        transactions: (txRes.data || []).map((tx) => ({
          amount: Number(tx.amount),
          type: tx.type,
          description: tx.description,
          created_at: tx.created_at,
        })),
        subscriptions,
        referral: {
          link: `https://t.me/${BOT}?start=ref_${telegramId}`,
          invited: refs.length,
          bonus_earned: refs.reduce((s, r) => s + Number(r.total_earned ?? r.reward_value ?? 0), 0),
          percent: Number(settings?.referral_percent ?? 10),
        },
        faq,
        birthday_discount: Number(settings?.birthday_discount_percent ?? 10),
        cashback_enabled: Boolean(settings?.cashback_enabled),
        cashback_percent: Number(settings?.cashback_percent ?? 10),
        min_topup: Number(settings?.min_topup ?? 5000),
        support: PAYMENT_WARN_SUPPORT,
      });
    }

    if (body.action === 'topup') {
      const settings = await fetchSettings(supabase).catch(() => null);
      const minTopup = Number(settings?.min_topup ?? 5000);
      const base = Math.round(Number(body.amount || 0));
      if (!(base >= minTopup)) return json(400, { ok: false, error: 'min_topup', min: minTopup });

      const uniquePrice = await generateUniquePrice(supabase, base);
      const cashbackEnabled = Boolean(settings?.cashback_enabled);
      const cashbackPercent = Number(settings?.cashback_percent ?? 10);
      const cashback = cashbackEnabled ? Math.round((base * cashbackPercent) / 100) : 0;
      const credit = uniquePrice + cashback;
      const expiresAt = new Date(
        Date.now() + Number(process.env.WEBAPP_CHECKOUT_MINUTES || 10) * 60000,
      ).toISOString();

      const order = await createOrder(supabase, {
        user_telegram_id: telegramId,
        order_type: 'topup',
        amount: uniquePrice,
        base_price: base,
        unique_price: uniquePrice,
        expires_at: expiresAt,
        status: 'waiting_payment',
        delivery_status: 'not_required',
        payment_method: 'humo_card_bot',
        payment_source: 'humo_card_bot',
        topup_credit: credit,
      });

      return json(200, {
        ok: true,
        order_id: order.id,
        order_number: order.order_number,
        amount: uniquePrice,
        credit,
        cashback,
        cashback_enabled: cashbackEnabled,
        card_number: cardNumber(settings),
        support: PAYMENT_WARN_SUPPORT,
        expires_at: expiresAt,
      });
    }

    if (body.action === 'order-status') {
      const orderId = body.orderId;
      if (!orderId) return json(400, { ok: false, error: 'no_order_id' });
      const order = await getOrderById(supabase, orderId);
      if (!order || String(order.user_telegram_id) !== telegramId) {
        return json(404, { ok: false, error: 'not_found' });
      }
      // Taymer tugaganda SERVER holatini o'zgartirmaymiz (band qiladigan narsa yo'q).
      // "Muddat o'tdi"ni expires_at asosida hisoblab qaytaramiz; haqiqiy "expired"
      // holatini har daqiqalik maintenance cron va init tozalash qo'yadi.
      const isExpiredNow =
        order.status === 'expired' ||
        (['waiting_payment', 'pending_payment'].includes(order.status) &&
          order.expires_at &&
          new Date(order.expires_at).getTime() < Date.now());
      const paid = ['payment_detected', 'delivering', 'completed'].includes(order.status);
      const delivered = order.delivery_status === 'delivered' || order.status === 'completed';
      const deliveries = delivered ? await collectDeliveries(supabase, orderId).catch(() => []) : [];
      return json(200, {
        ok: true,
        status: order.status,
        delivery_status: order.delivery_status,
        paid,
        delivered,
        waiting_stock: order.delivery_status === 'waiting_stock',
        manual: order.delivery_status === 'manual_required',
        expired: isExpiredNow,
        order_number: order.order_number,
        amount: Number(order.unique_price || 0),
        expires_at: order.expires_at,
        deliveries,
      });
    }

    if (body.action === 'history') {
      const ordersRes = await request(supabase, 'orders', {
        query: `select=*&user_telegram_id=eq.${telegramId}&order=created_at.desc&limit=50`,
      });
      const purchases = (ordersRes.data || []).filter(
        (o) => String(o.order_type || 'purchase') !== 'topup',
      );

      const itemsByOrder = {};
      const subsByOrder = {};
      if (purchases.length) {
        const inList = `(${purchases.map((o) => o.id).join(',')})`;
        const [oiRes, subsRes] = await Promise.all([
          request(supabase, 'order_items', {
            query: `select=order_id,quantity,unit_price,plans(name)&order_id=in.${inList}`,
          }).catch(() => ({ data: [] })),
          request(supabase, 'subscriptions', {
            query: `select=order_id,started_at,expires_at&order_id=in.${inList}`,
          }).catch(() => ({ data: [] })),
        ]);
        for (const it of oiRes.data || []) {
          (itemsByOrder[it.order_id] || (itemsByOrder[it.order_id] = [])).push({
            name: it.plans?.name || '—',
            quantity: Number(it.quantity || 1),
            price: Number(it.unit_price || 0),
          });
        }
        for (const s of subsRes.data || []) {
          subsByOrder[s.order_id] = { started_at: s.started_at, expires_at: s.expires_at };
        }
      }

      const orders = purchases.map((o) => ({
        id: o.id,
        order_number: o.order_number,
        status: statusCategory(o.status),
        amount: Number(o.unique_price ?? o.amount ?? 0),
        currency: 'UZS',
        created_at: o.created_at,
        items: itemsByOrder[o.id] || [],
        subscription: subsByOrder[o.id] || null,
      }));

      return json(200, { ok: true, orders });
    }

    if (body.action === 'wishlist') {
      const wlRes = await request(supabase, 'wishlist', {
        query: `select=plan_id,price_at_add,created_at&user_telegram_id=eq.${telegramId}&order=created_at.desc`,
      });
      const wl = wlRes.data || [];
      if (!wl.length) return json(200, { ok: true, items: [] });

      const planIds = wl.map((w) => w.plan_id);
      const [plansRes, stockMap] = await Promise.all([
        request(supabase, 'plans', { query: `select=*&id=in.(${planIds.join(',')})` }),
        availableStockByPlan(supabase).catch(() => ({})),
      ]);
      const byId = {};
      for (const p of plansRes.data || []) byId[p.id] = p;

      const items = wl
        .map((w) => {
          const p = byId[w.plan_id];
          if (!p || !p.is_active) return null;
          const auto = AUTO_DELIVERY.includes(p.delivery_type);
          const stock = auto ? stockMap[p.id] || 0 : null;
          const inStock = auto ? stock > 0 : true;
          const priceAtAdd = w.price_at_add != null ? Number(w.price_at_add) : null;
          return {
            ...productShape(p, { stock, inStock, rating: { avg: 0, count: 0 } }),
            price_at_add: priceAtAdd,
            price_dropped: priceAtAdd != null && Number(p.price) < priceAtAdd,
          };
        })
        .filter(Boolean);
      // Wishlistda stock=0 obunalar ham ko'rsatiladi (foydalanuvchi o'chira olishi uchun).

      return json(200, { ok: true, items });
    }

    return json(400, { ok: false, error: 'unknown_action' });
  } catch (error) {
    console.error('webapp-api error', error);
    return json(500, { ok: false, error: 'server_error' });
  }
};
