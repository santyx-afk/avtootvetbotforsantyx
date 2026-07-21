const crypto = require('crypto');
const { getAdminClient, request, fetchPlan } = require('../../shared/db');
const { showPayment } = require('../../shared/bot-service');
const { parseTelegramInitData } = require('../../shared/telegram');

exports.handler = async (event, context) => {
  const method = event.httpMethod;
  const initData = event.headers['x-tg-init-data'];
  
  if (!initData) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Unauthorized: No initData' }) };
  }

  const tgUser = parseTelegramInitData(initData);
  if (!tgUser) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Unauthorized: Invalid initData' }) };
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
        return { statusCode: 200, body: JSON.stringify({ ok: true, categories, plans }) };
      } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
      }
    }
  }

  if (method === 'POST') {
    try {
      const body = JSON.parse(event.body);
      if (body.action === 'create_order') {
        const planId = body.planId;
        const tgId = tgUser.id;

        const plan = await fetchPlan(supabase, planId);
        if (!plan) throw new Error('Plan not found');

        // We use showPayment which creates the order, sets user state, and sends the payment instructions to the bot!
        await showPayment({ supabase, chatId: tgId, telegramId: tgId, planId });

        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
