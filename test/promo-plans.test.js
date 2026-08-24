const test = require('node:test');
const assert = require('node:assert');

const { promoAppliesToPlans } = require('../shared/db.js');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

// Promokod tovarga bog'lanmagan bo'lsa (eski promokodlar) — hammaga amal qiladi.
test('plan_ids yo\'q bo\'lsa barcha tovarlarga amal qiladi', () => {
  assert.strictEqual(promoAppliesToPlans({}, [A]), true);
  assert.strictEqual(promoAppliesToPlans({ plan_ids: null }, [A]), true);
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [] }, [A]), true);
  // Bo'sh qiymatlardan tozalangach ham bo'sh qolsa — cheklov yo'q deb qaraladi.
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [null, ''] }, [A]), true);
});

test('bitta tovarga bog\'langan promokod', () => {
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [A] }, [A]), true);
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [A] }, [B]), false);
});

test('bir nechta tovarga bog\'langan promokod', () => {
  const promo = { plan_ids: [A, B] };
  assert.strictEqual(promoAppliesToPlans(promo, [A]), true);
  assert.strictEqual(promoAppliesToPlans(promo, [B]), true);
  assert.strictEqual(promoAppliesToPlans(promo, [C]), false);
});

test('savatda bir nechta tovar: kamida bittasi mos kelsa yetarli', () => {
  const promo = { plan_ids: [A] };
  assert.strictEqual(promoAppliesToPlans(promo, [B, A, C]), true);
  assert.strictEqual(promoAppliesToPlans(promo, [B, C]), false);
});

test('bitta tovar massivsiz uzatilsa ham ishlaydi', () => {
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [A] }, A), true);
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [A] }, B), false);
});

test('tovar noma\'lum bo\'lsa to\'smaydi (tekshiruv keyinroq bo\'ladi)', () => {
  // Chaqiruvchi hali savatni bilmasa bo'sh ro'yxat uzatadi — bu bosqichda
  // promokodni rad etish noto'g'ri bo'lardi.
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [A] }, []), true);
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [A] }, [null]), true);
});

test('id turi (string/UUID) farq qilmaydi', () => {
  assert.strictEqual(promoAppliesToPlans({ plan_ids: [A] }, [String(A)]), true);
});
