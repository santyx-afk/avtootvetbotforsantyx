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
  reserveInventoryForOrder,
  setUserAwaitingReceipt,
  addWalletTransaction,
  getOrderById,
  getOrderItems,
  getInventoryItemById,
} = require('../../shared/db');
const {
  processApprovedOrderDelivery,
  resolveAutoAccount,
  resolveLicenseKey,
} = require('../../shared/delivery-service');
const { validateInitData } = require('../../shared/webapp-auth');

const PAYMENT_WARN_SUPPORT = (process.env.SUPPORT_USERNAME || '@santyx').replace(/^@?/, '@');

function cardNumber(settings) {
  return settings?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '';
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

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
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
function productShape(row, { stock, inStock, rating }) {
  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    description: row.description || '',
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const initData =
    event.headers['x-telegram-init-data'] ||
    event.headers['X-Telegram-Init-Data'] ||
    body.initData ||
    '';

  const auth = validateInitData(initData);
  if (!auth.ok) return json(401, { ok: false, error: 'unauthorized', reason: auth.reason });

  const supabase = getAdminClient();
  const tgUser = auth.user;
  const telegramId = String(tgUser.id);

  try {
    // Foydalanuvchini har doim ro'yxatga olamiz/yangilaymiz (phone ga tegmaydi)
    await upsertUser(supabase, tgUser).catch((e) => console.warn('upsertUser warn:', e?.message));

    if (body.action === 'init') {
      let hasPhone = false;
      try {
        const { data } = await request(supabase, 'users', {
          query: `select=phone&telegram_id=eq.${telegramId}&limit=1`,
        });
        hasPhone = Boolean(data?.[0]?.phone);
      } catch (e) {
        // phone ustuni hali yo'q bo'lsa (migratsiya qo'llanmagan) — bloklamaymiz
        console.warn('phone column read warn:', e?.message);
      }
      return json(200, {
        ok: true,
        hasPhone,
        user: {
          id: telegramId,
          first_name: tgUser.first_name || null,
          last_name: tgUser.last_name || null,
          username: tgUser.username || null,
          language_code: tgUser.language_code || null,
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
          query: 'select=id,title,image_url,link,expires_at&is_active=eq.true&order=sort_order.asc',
        }).catch(() => ({ data: [] })),
        request(supabase, 'categories', {
          query: 'select=id,name,button_label,sort_order&is_active=eq.true&order=sort_order.asc,created_at.asc',
        }),
        request(supabase, 'plans', {
          query: 'select=*&is_active=eq.true&order=sort_order.asc,created_at.asc',
        }),
        request(supabase, 'reviews', { query: 'select=plan_id,rating&is_hidden=eq.false' }).catch(() => ({ data: [] })),
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
        })
        // stock = 0 (auto-yetkazish) obunalar yashiriladi
        .filter((p) => p.in_stock);

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
          query: `select=id,rating,text,admin_reply,user_name,created_at&plan_id=eq.${productId}&is_hidden=eq.false&order=created_at.desc`,
        }).catch(() => ({ data: [] })),
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
      return json(200, { ok: true, in_wishlist: true });
    }

    if (body.action === 'add-review') {
      const productId = body.productId;
      const rating = Math.round(Number(body.rating || 0));
      const text = String(body.text || '').trim().slice(0, 1000);
      if (!productId) return json(400, { ok: false, error: 'no_product_id' });
      if (!(rating >= 1 && rating <= 5)) return json(400, { ok: false, error: 'bad_rating' });

      const userName = tgUser.first_name || 'Foydalanuvchi';
      const { data } = await request(supabase, 'reviews', {
        method: 'POST',
        query: 'on_conflict=plan_id,user_telegram_id',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: {
          plan_id: productId,
          user_telegram_id: telegramId,
          user_name: userName,
          rating,
          text,
          updated_at: new Date().toISOString(),
        },
      });
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
      const result = await validatePromoCode(supabase, code, basePrice);
      if (!result.ok) return json(200, { ok: true, valid: false, reason: result.reason });
      return json(200, {
        ok: true,
        valid: true,
        code: result.promo.code,
        discount: result.discount,
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
      if (body.promoCode) {
        const res = await validatePromoCode(supabase, String(body.promoCode).trim(), basePrice);
        if (res.ok) {
          promo = res.promo;
          discount = res.discount;
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
        expiresMinutes: Number(process.env.WEBAPP_CHECKOUT_MINUTES || 10),
      });

      await reserveInventoryForOrder(supabase, order.id).catch((e) =>
        console.warn('reserve warn:', e?.message),
      );
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
        balance_used: balanceUsed,
        amount: Number(order.unique_price || 0),
        card_number: cardNumber(settings),
        support: PAYMENT_WARN_SUPPORT,
        expires_at: order.expires_at,
        fully_paid: fullyCovered,
      });
    }

    if (body.action === 'order-status') {
      const orderId = body.orderId;
      if (!orderId) return json(400, { ok: false, error: 'no_order_id' });
      const order = await getOrderById(supabase, orderId);
      if (!order || String(order.user_telegram_id) !== telegramId) {
        return json(404, { ok: false, error: 'not_found' });
      }
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
        expired: order.status === 'expired',
        order_number: order.order_number,
        amount: Number(order.unique_price || 0),
        expires_at: order.expires_at,
        deliveries,
      });
    }

    return json(400, { ok: false, error: 'unknown_action' });
  } catch (error) {
    console.error('webapp-api error', error);
    return json(500, { ok: false, error: 'server_error' });
  }
};
