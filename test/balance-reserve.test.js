const test = require('node:test');
const assert = require('node:assert/strict');

// db.js fetch orqali ishlaydi. Bu yerda user_wallets ni xotirada, ATOMIK
// compare-and-swap bilan taqlid qilamiz — reserveWalletBalance balansni ikki
// marta sarflashiga yo'l qo'ymasligini shu orqali tekshiramiz.
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const db = require('../shared/db');

function installWalletMock(initialBalance) {
  const store = { balance: initialBalance };
  const tx = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    const query = u.includes('?') ? u.split('?')[1] : '';
    const params = new URLSearchParams(query);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const reply = (data) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(data),
      json: async () => data,
    });

    if (u.includes('/rest/v1/user_wallets')) {
      if (method === 'GET') return reply([{ user_telegram_id: 'u1', balance: store.balance }]);
      if (method === 'PATCH') {
        // CAS: balance=eq.<old> sharti bajarilsagina yozamiz.
        const cond = params.get('balance'); // "eq.<old>"
        const expected = cond ? Number(cond.replace('eq.', '')) : null;
        if (expected != null && Number(store.balance) !== expected) return reply([]); // yo'qotilgan yangilanish
        store.balance = Number(body.balance);
        return reply([{ user_telegram_id: 'u1', balance: store.balance }]);
      }
      if (method === 'POST') {
        // adjustWalletBalance REST fallback (refund) — on_conflict upsert
        store.balance = Number(body.balance);
        return reply([{ user_telegram_id: 'u1', balance: store.balance }]);
      }
    }
    if (u.includes('/rest/v1/rpc/credit_user_wallet')) {
      // Refund RPC yo'lini ham qo'llab-quvvatlaymiz.
      store.balance = Number(store.balance) + Number(body.p_amount);
      return reply([{ user_telegram_id: 'u1', balance: store.balance }]);
    }
    if (u.includes('/rest/v1/wallet_transactions')) {
      if (method === 'POST') { tx.push(body); return reply([{ id: tx.length, ...body }]); }
      return reply([]);
    }
    if (u.includes('/rest/v1/audit_logs')) return reply([]);
    return reply([]);
  };
  return { store, tx };
}

test('reserveWalletBalance debits only up to the available balance', async () => {
  const { store } = installWalletMock(50000);
  const taken = await db.reserveWalletBalance({ url: process.env.SUPABASE_URL, key: 'mock' }, 'u1', 30000);
  assert.equal(taken, 30000);
  assert.equal(store.balance, 20000);
});

test('reserveWalletBalance never goes negative — caps at balance', async () => {
  const { store } = installWalletMock(20000);
  const taken = await db.reserveWalletBalance({ url: process.env.SUPABASE_URL, key: 'mock' }, 'u1', 50000);
  assert.equal(taken, 20000);
  assert.equal(store.balance, 0);
});

test('two sequential reservations cannot spend the same balance twice', async () => {
  const client = { url: process.env.SUPABASE_URL, key: 'mock' };
  const { store } = installWalletMock(50000);
  const first = await db.reserveWalletBalance(client, 'u1', 50000);
  const second = await db.reserveWalletBalance(client, 'u1', 50000);
  assert.equal(first, 50000);
  assert.equal(second, 0); // balans tugagan — ikkinchi buyurtma balansdan hech nima olmaydi
  assert.equal(store.balance, 0);
});

test('refundOrderBalance returns the reserved balance back to the wallet', async () => {
  const client = { url: process.env.SUPABASE_URL, key: 'mock' };
  const { store } = installWalletMock(0);
  const ok = await db.refundOrderBalance(client, { id: 'o1', order_number: '111', user_telegram_id: 'u1', balance_used: 15000 });
  assert.equal(ok, true);
  assert.equal(store.balance, 15000);
});

test('refundOrderBalance does nothing when no balance was used', async () => {
  const client = { url: process.env.SUPABASE_URL, key: 'mock' };
  const { store } = installWalletMock(0);
  const ok = await db.refundOrderBalance(client, { id: 'o2', order_number: '222', user_telegram_id: 'u1', balance_used: 0 });
  assert.equal(ok, false);
  assert.equal(store.balance, 0);
});
