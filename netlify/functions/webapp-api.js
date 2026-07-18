const crypto = require('crypto');
const { getAdminClient } = require('../../shared/db');
const { sendCheckoutMenu } = require('../../shared/bot-service');
const { parseTelegramInitData } = require('../../shared/telegram');

exports.handler = async (event, context) => {
  const method = event.httpMethod;
  const initData = event.headers['x-tg-init-data'];
  
  if (!initData) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Unauthorized: No initData' }) };
  }

  // Verify initData (you need to implement this in shared/telegram or verify it here)
  // For now, let's assume it's valid if we can parse it, but in production verify the hash!
  const tgUser = parseTelegramInitData(initData);
  if (!tgUser) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Unauthorized: Invalid initData' }) };
  }

  const supabase = getAdminClient();

  if (method === 'GET') {
    const action = event.queryStringParameters.action;
    if (action === 'catalog') {
      try {
        const { data: categories, error: catErr } = await supabase.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true });
        if (catErr) throw catErr;

        const { data: plans, error: planErr } = await supabase.from('plans').select('*').eq('is_active', true).order('sort_order', { ascending: true });
        if (planErr) throw planErr;

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

        // Fetch plan details
        const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
        if (!plan) throw new Error('Plan not found');

        // Send checkout menu via bot
        await sendCheckoutMenu(tgId, plan);

        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
