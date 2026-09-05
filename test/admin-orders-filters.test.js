const test = require('node:test');
const assert = require('node:assert/strict');
const { _buildOrderFilters: buildOrderFilters, _safeDate: safeDate } = require('../netlify/functions/admin-orders.js');

test('safeDate: faqat YYYY-MM-DD o\'tadi', () => {
  assert.equal(safeDate('2026-09-05'), '2026-09-05');
  assert.equal(safeDate(' 2026-09-05 '), '2026-09-05');
  assert.equal(safeDate('05.09.2026'), '');
  assert.equal(safeDate('2026-09-05T00:00'), '');
  assert.equal(safeDate(undefined), '');
});

test('buildOrderFilters: filtrsiz bo\'sh obyekt', () => {
  assert.deepEqual(buildOrderFilters({}), {});
});

test('buildOrderFilters: holat oddiy filtr, sana oralig\'i and guruhida', () => {
  const q = buildOrderFilters({ status: 'completed', from: '2026-09-01', to: '2026-09-05' });
  assert.equal(q.status, 'eq.completed');
  assert.equal(q.and, '(created_at.gte.2026-09-01T00:00:00+05:00,created_at.lte.2026-09-05T23:59:59.999+05:00)');
});

test('buildOrderFilters: tur — topup oddiy filtr, purchase null qatorlarni ham oladi', () => {
  assert.equal(buildOrderFilters({ type: 'topup' }).order_type, 'eq.topup');
  assert.equal(buildOrderFilters({ type: 'purchase' }).and, '(or(order_type.eq.purchase,order_type.is.null))');
});

test('buildOrderFilters: qidiruv va tur bitta and guruhiga yig\'iladi', () => {
  const q = buildOrderFilters({ type: 'purchase', search: '123' });
  assert.equal(q.and, '(or(order_type.eq.purchase,order_type.is.null),or(order_number.ilike.*123*,user_telegram_id.ilike.*123*))');
});
