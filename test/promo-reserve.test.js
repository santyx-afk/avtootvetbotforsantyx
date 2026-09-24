const test = require('node:test');
const assert = require('node:assert/strict');

// Promokod used_count endi atomik (CAS): max_uses dan oshib ketmaydi, va
// abandon qilingan buyurtma release orqali foydalanishni qaytaradi.
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const db = require('../shared/db');
const client = { url: process.env.SUPABASE_URL, key: 'mock' };

function installPromoMock({ id = 'promo1', code = 'SALE', used = 0, max = null }) {
  const store = { id, code, used_count: used, max_uses: max };
  const audit = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    const params = new URLSearchParams(u.includes('?') ? u.split('?')[1] : '');
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const reply = (data) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(data), json: async () => data });

    if (u.includes('/rest/v1/promo_codes')) {
      if (method === 'GET') return reply([{ id: store.id, code: store.code, used_count: store.used_count, max_uses: store.max_uses }]);
      if (method === 'PATCH') {
        const cond = params.get('used_count'); // "eq.<old>"
        const expected = cond ? Number(cond.replace('eq.', '')) : null;
        if (expected != null && Number(store.used_count) !== expected) return reply([]); // CAS mos kelmadi
        store.used_count = Number(body.used_count);
        return reply([{ id: store.id, used_count: store.used_count }]);
      }
    }
    if (u.includes('/rest/v1/audit_logs')) {
      if (method === 'GET') return reply(audit.filter((a) => a.action === 'promo_use_released'));
      if (method === 'POST') { audit.push(body); return reply([body]); }
    }
    return reply([]);
  };
  return store;
}

test('reservePromoUse increments used_count when under the limit', async () => {
  const store = installPromoMock({ used: 4, max: 5 });
  const ok = await db.reservePromoUse(client, { id: 'promo1' });
  assert.equal(ok, true);
  assert.equal(store.used_count, 5);
});

test('reservePromoUse refuses once the limit is reached (no overshoot)', async () => {
  const store = installPromoMock({ used: 5, max: 5 });
  const ok = await db.reservePromoUse(client, { id: 'promo1' });
  assert.equal(ok, false);
  assert.equal(store.used_count, 5, 'max_uses dan oshmaydi');
});

test('reservePromoUse allows unlimited promo (max_uses null)', async () => {
  const store = installPromoMock({ used: 100, max: null });
  const ok = await db.reservePromoUse(client, { id: 'promo1' });
  assert.equal(ok, true);
  assert.equal(store.used_count, 101);
});

test('releasePromoUse gives a use back, once per order', async () => {
  const store = installPromoMock({ code: 'SALE', used: 3, max: 5 });
  const order = { id: 'o1', order_number: '111', user_telegram_id: '9', promo_code: 'SALE' };
  const first = await db.releasePromoUse(client, order);
  assert.equal(first, true);
  assert.equal(store.used_count, 2);
  // Ikkinchi marta — guard tufayli hech narsa qilmaydi.
  const second = await db.releasePromoUse(client, order);
  assert.equal(second, false);
  assert.equal(store.used_count, 2, 'ikki marta release bo\'lmaydi');
});

test('releasePromoUse is a no-op when the order had no promo', async () => {
  const store = installPromoMock({ used: 3, max: 5 });
  const ok = await db.releasePromoUse(client, { id: 'o2', promo_code: null });
  assert.equal(ok, false);
  assert.equal(store.used_count, 3);
});
