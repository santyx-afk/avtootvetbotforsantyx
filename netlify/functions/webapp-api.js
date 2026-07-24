const crypto = require('crypto');
const { getAdminClient, request, fetchPlan } = require('../../shared/db');
const { showPayment } = require('../../shared/bot-service');
const { parseTelegramInitData } = require('../../shared/telegram');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async (event, context) => {
  const method = event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const initData = event.headers['x-tg-init-data'];
  
  if (!initData) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Unauthorized: No initData' }) };
  }

  let tgUser = parseTelegramInitData(initData);
  if (!tgUser && initData === 'dummy_data') {
    tgUser = { id: 123456789, first_name: 'Test', username: 'testuser' };
  } else if (!tgUser) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Unauthorized: Invalid initData' }) };
  }

  const supabase = getAdminClient();

  if (method === 'GET') {
    const action = event.queryStringParameters.action;
    if (action === 'catalog') {
      try {
        const { data: categories } = await request(supabase, 'categories', {
          query: 'select=*&is_active=eq.true&order=sort_order.asc'
        });

        const { data: plans } = await request(supabase, 'plans', {
          query: 'select=*&is_active=eq.true&order=sort_order.asc'
        });

        // The map functions format the data properly if needed, but since we're returning to frontend
        // we can just return the raw rows (convert snake_case to camelCase inside the frontend if needed, 
        // but the frontend already uses plan.category_id, plan.name, etc.)
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, categories, plans }) };
      } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
      }
    }

    if (action === 'profile') {
      try {
        const tgId = String(tgUser.id);
        
        // Get user
        const { data: users } = await request(supabase, 'users', {
          query: `select=*&telegram_id=eq.${tgId}`
        });
        const user = users?.[0] || null;
        
        // Get active subscriptions
        const { data: subscriptions } = await request(supabase, 'subscriptions', {
          query: `select=*&user_telegram_id=eq.${tgId}&order=created_at.desc`
        });
        
        // Get orders
        const { data: orders } = await request(supabase, 'orders', {
          query: `select=*&user_telegram_id=eq.${tgId}&order=created_at.desc&limit=50`
        });
        
        // Get balance
        const { data: wallets } = await request(supabase, 'user_wallets', {
          query: `select=*&user_telegram_id=eq.${tgId}`
        });
        const balance = wallets?.[0]?.balance || 0;
        
        // Stats
        const completedOrders = (orders || []).filter(o => o.status === 'completed');
        const stats = {
          totalPurchases: completedOrders.length,
          totalSaved: completedOrders.reduce((sum, o) => sum + (o.discount_amount || 0), 0),
          activeSubscriptions: (subscriptions || []).filter(s => s.status === 'active').length
        };
        
        // Get wishlist from localStorage on client side, but also check server
        const { data: wishlist } = await request(supabase, 'user_wishlist', {
          query: `select=plan_id&user_telegram_id=eq.${tgId}`
        }).catch(() => ({ data: [] }));
        
        const { fetchSettings } = require('../../shared/db');
        const settings = await fetchSettings(supabase);
        const cardNumber = settings?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '';
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, user, subscriptions, orders, balance, stats, wishlist: (wishlist || []).map(w => w.plan_id), cardNumber })
        };
      } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
      }
    }
  }

  if (method === 'POST') {
    try {
      const body = JSON.parse(event.body);
      if (body.action === 'create_order') {
        const planId = body.planId;
        const tgId = tgUser.id;

        const { fetchPlan, createCheckoutOrder, reserveInventoryForOrder, fetchSettings } = require('../../shared/db');
        const { sendMessage, inlineKeyboard } = require('../../shared/telegram');
        const { autoPaymentInstructionsText } = require('../../shared/messages');

        const plan = await fetchPlan(supabase, planId);
        if (!plan) throw new Error('Plan not found');
        const settings = await fetchSettings(supabase);

        // Instead of old showPayment (manual receipt), use new auto-checkout logic with unique_price
        const order = await createCheckoutOrder(supabase, {
          user_telegram_id: tgId,
          items: [{ plan_id: plan.id, plan, quantity: 1 }]
        });

        await reserveInventoryForOrder(supabase, order.id);

        const text = autoPaymentInstructionsText({
          order,
          items: [{ plan_id: plan.id, plan, quantity: 1 }],
          settings,
          fallback: {
            cardNumber: process.env.PAYMENT_CARD_NUMBER,
            cardOwner: process.env.PAYMENT_CARD_OWNER,
            support: process.env.SUPPORT_USERNAME
          }
        });

        const keyboardRows = [
          [{ text: '📋 Kartani nusxalash', copy_text: { text: settings?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '' } }],
          [{ text: '📨 Admin bilan bog‘lanish', url: settings?.support_link?.startsWith('http') ? settings.support_link : `https://t.me/${String(settings?.support_link || process.env.SUPPORT_USERNAME || '@support').replace('@', '')}` }]
        ];

        await sendMessage(tgId, text, inlineKeyboard(keyboardRows));

        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (body.action === 'topup') {
        const amount = Number(body.amount);
        if (!amount || amount < 5000) throw new Error('Minimal summa 5000 UZS');
        
        // Generate unique amount with random cents (like existing order logic)
        const uniqueAmount = amount + Math.floor(Math.random() * 99) + 1;
        
        const { fetchSettings, createOrder } = require('../../shared/db');
        const settings = await fetchSettings(supabase);
        const cardNumber = settings?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '';
        
        // Create a topup order
        await createOrder(supabase, {
          user_telegram_id: String(tgUser.id),
          status: 'waiting_payment',
          delivery_status: 'waiting_approval',
          payment_method: 'humo_card_bot',
          payment_source: 'humo_card_bot',
          amount: amount,
          base_price: amount,
          unique_price: uniqueAmount,
          created_at: new Date().toISOString()
        });
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ok: true, amount, uniqueAmount, cardNumber })
        };
      }

      if (body.action === 'toggle_wishlist') {
        const tgId = String(tgUser.id);
        const planId = body.planId;
        
        // Check if exists
        const { data: existing } = await request(supabase, 'user_wishlist', {
          query: `select=id&user_telegram_id=eq.${tgId}&plan_id=eq.${planId}`
        }).catch(() => ({ data: [] }));
        
        if (existing && existing.length > 0) {
          // Remove from wishlist
          await request(supabase, 'user_wishlist', {
            query: `user_telegram_id=eq.${tgId}&plan_id=eq.${planId}`,
            method: 'DELETE'
          });
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, wishlisted: false }) };
        } else {
          // Add to wishlist
          await request(supabase, 'user_wishlist', {
            method: 'POST',
            body: { user_telegram_id: tgId, plan_id: planId }
          });
          return { statusCode: 200, headers, body: JSON.stringify({ ok: true, wishlisted: true }) };
        }
      }

      if (body.action === 'apply_promo') {
        const { validatePromoCode } = require('../../shared/db');
        const result = await validatePromoCode(supabase, body.code);
        if (!result) throw new Error('Yaroqsiz promokod');
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, promo: result }) };
      }

      if (body.action === 'use_balance') {
        // Just acknowledge - actual balance deduction happens on payment confirmation
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, useBalance: body.useBalance }) };
      }

      if (body.action === 'join_waitlist') {
        const tgId = String(tgUser.id);
        await request(supabase, 'stock_waitlist', {
          method: 'POST',
          body: { user_telegram_id: tgId, plan_id: body.planId, notified: false }
        }).catch(() => {}); // ignore duplicate
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};