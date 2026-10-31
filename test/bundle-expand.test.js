const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const Module = require('node:module');

// To'plam (bundle) checkout paytida tarkibiy rejalarga YOYILADI va o'sha
// yerdan mavjud ko'p mahsulotli yetkazish oqimi (order_items →
// processApprovedOrderDelivery) ishlaydi. Shu yoyilish to'g'ri bo'lmasa:
//   - mijoz bitta akkaunt oladi-yu to'plam puli to'lagan bo'ladi, yoki
//   - foyda hisobi (tannarx) noto'g'ri chiqadi.
// Shuning uchun yoyilish alohida tekshiriladi.

const CAPCUT = { id: 'p-capcut', name: 'CapCut Pro', price: 39000 };
const CANVA = { id: 'p-canva', name: 'Canva Pro', price: 29000 };

function loadDb({ bundleRows = [] } = {}) {
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../shared/db')];
  const db = require('../shared/db');
  Module._load = originalLoad;

  // request() ni to'g'ridan-to'g'ri almashtirish o'rniga, fetchBundleItemsForPlans
  // ishlatadigan jadvalni mock qiluvchi klient beramiz. db.request global
  // fetch orqali ketadi, shuning uchun fetch ni vaqtincha almashtiramiz.
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('plan_bundle_items')) {
      return new Response(JSON.stringify(bundleRows), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { db, restore: () => { global.fetch = originalFetch; } };
}

const client = { url: 'https://mock.supabase.co', key: 'mock' };

test('oddiy reja: har bir dona uchun bitta element', async () => {
  const { db, restore } = loadDb();
  try {
    const rows = await db.expandBundleOrderItems(client, 'order-1', '555', [
      { plan_id: CAPCUT.id, plan: { ...CAPCUT, is_bundle: false }, quantity: 2 },
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.plan_id), [CAPCUT.id, CAPCUT.id]);
    assert.equal(rows[0].unit_price, 39000);
    assert.equal(rows[0].order_id, 'order-1');
    assert.equal(rows[0].user_telegram_id, '555');
    assert.equal(rows[0].delivery_status, 'pending');
  } finally {
    restore();
  }
});

test('to\'plam: tarkibiy rejalarga yoyiladi, narx tarkibiy rejaning o\'zinikidan', async () => {
  const bundleRows = [
    { id: 'b1', bundle_plan_id: 'p-bundle', child_plan_id: CAPCUT.id, quantity: 1, sort_order: 1, plans: CAPCUT },
    { id: 'b2', bundle_plan_id: 'p-bundle', child_plan_id: CANVA.id, quantity: 1, sort_order: 2, plans: CANVA },
  ];
  const { db, restore } = loadDb({ bundleRows });
  try {
    const rows = await db.expandBundleOrderItems(client, 'order-2', '555', [
      { plan_id: 'p-bundle', plan: { id: 'p-bundle', name: 'Kontent Starter', price: 55000, is_bundle: true }, quantity: 1 },
    ]);
    assert.equal(rows.length, 2, 'to‘plam ikkita elementga aylanadi');
    assert.deepEqual(rows.map((r) => r.plan_id), [CAPCUT.id, CANVA.id]);
    // Dashboard sotuv qiymatini unit_price ULUSHIGA qarab bo'ladi, shuning
    // uchun bu yerda tarkibiy rejaning o'z narxi turishi kerak — aks holda
    // foyda noto'g'ri rejaga yozilardi.
    assert.deepEqual(rows.map((r) => r.unit_price), [39000, 29000]);
  } finally {
    restore();
  }
});

test('to\'plam x2 va ichki miqdor: har bir nusxa alohida element', async () => {
  const bundleRows = [
    { id: 'b1', bundle_plan_id: 'p-bundle', child_plan_id: CAPCUT.id, quantity: 2, sort_order: 1, plans: CAPCUT },
    { id: 'b2', bundle_plan_id: 'p-bundle', child_plan_id: CANVA.id, quantity: 1, sort_order: 2, plans: CANVA },
  ];
  const { db, restore } = loadDb({ bundleRows });
  try {
    const rows = await db.expandBundleOrderItems(client, 'order-3', '555', [
      { plan_id: 'p-bundle', plan: { id: 'p-bundle', price: 99000, is_bundle: true }, quantity: 2 },
    ]);
    // 2 ta to'plam × (2 ta CapCut + 1 ta Canva) = 6 ta element
    assert.equal(rows.length, 6);
    assert.equal(rows.filter((r) => r.plan_id === CAPCUT.id).length, 4);
    assert.equal(rows.filter((r) => r.plan_id === CANVA.id).length, 2);
    assert.ok(rows.every((r) => r.quantity === 1), 'har bir element bitta dona — yetkazish shunday ishlaydi');
  } finally {
    restore();
  }
});

test('tarkibi bo\'sh to\'plam: buyurtma yo\'qolmaydi, oddiy element bo\'lib qoladi', async () => {
  // Admin to'plam belgisini qo'yib, tarkibini to'ldirmagan bo'lsa (yoki
  // migratsiya hali qo'llanmagan bo'lsa) mijozning puli ketib, buyurtmada
  // hech narsa bo'lmasligi mumkin emas.
  const { db, restore } = loadDb({ bundleRows: [] });
  try {
    const rows = await db.expandBundleOrderItems(client, 'order-4', '555', [
      { plan_id: 'p-bundle', plan: { id: 'p-bundle', price: 55000, is_bundle: true }, quantity: 1 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].plan_id, 'p-bundle');
    assert.equal(rows[0].unit_price, 55000);
  } finally {
    restore();
  }
});

test('aralash savat: to\'plam + oddiy reja', async () => {
  const bundleRows = [
    { id: 'b1', bundle_plan_id: 'p-bundle', child_plan_id: CAPCUT.id, quantity: 1, sort_order: 1, plans: CAPCUT },
    { id: 'b2', bundle_plan_id: 'p-bundle', child_plan_id: CANVA.id, quantity: 1, sort_order: 2, plans: CANVA },
  ];
  const { db, restore } = loadDb({ bundleRows });
  try {
    const rows = await db.expandBundleOrderItems(client, 'order-5', '555', [
      { plan_id: 'p-bundle', plan: { id: 'p-bundle', price: 55000, is_bundle: true }, quantity: 1 },
      { plan_id: 'p-gemini', plan: { id: 'p-gemini', price: 89000, is_bundle: false }, quantity: 1 },
    ]);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.plan_id), [CAPCUT.id, CANVA.id, 'p-gemini']);
  } finally {
    restore();
  }
});
