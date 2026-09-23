const test = require('node:test');
const assert = require('node:assert/strict');

// Checkout/topup ga chastota chegarasi: rate_limit_hit "allowed:false" desa
// 429 qaytadi (bir skript minutlab yuzlab buyurtma ocholmasin).
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '1:mock';
process.env.WEB_JWT_SECRET = 'test-web-jwt-secret-value';

const { signJwt } = require('../shared/webapp-auth');
const { handler } = require('../netlify/functions/webapp-api');

function installMock(rateVerdict) {
  const seen = { rateLimitCalls: 0, orderPosts: 0 };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    const reply = (data) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data });
    if (u.includes('/rest/v1/rpc/rate_limit_hit')) { seen.rateLimitCalls += 1; return reply(rateVerdict); }
    if (u.includes('/rest/v1/users')) return reply([{ is_blocked: false }]);
    if (u.includes('/rest/v1/settings')) return reply([{ id: 1, min_topup: 5000 }]);
    if (u.includes('/rest/v1/orders') && method === 'GET') return reply([]);
    if (u.includes('/rest/v1/orders') && method === 'POST') { seen.orderPosts += 1; return reply([{ id: 'o1', order_number: '111', unique_price: 10001 }]); }
    return reply([]);
  };
  return seen;
}

function topupReq() {
  const token = signJwt({ telegram_id: '222' });
  return { httpMethod: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'topup', amount: 10000 }) };
}

test('topup returns 429 when the rate limit is exceeded', async () => {
  const seen = installMock({ allowed: false, retry_after: 300 });
  const res = await handler(topupReq());
  assert.equal(res.statusCode, 429);
  assert.match(res.body, /too_many_requests/);
  assert.equal(seen.orderPosts, 0, 'chegara oshganda buyurtma yaratilmaydi');
});

test('topup proceeds when the rate limit allows it', async () => {
  const seen = installMock({ allowed: true });
  const res = await handler(topupReq());
  assert.equal(res.statusCode, 200);
  assert.equal(seen.rateLimitCalls >= 1, true, 'rate-limit tekshirilishi kerak');
  assert.equal(seen.orderPosts, 1, 'buyurtma yaratiladi');
});
