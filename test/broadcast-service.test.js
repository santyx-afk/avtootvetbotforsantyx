const test = require('node:test');
const assert = require('node:assert/strict');
const { filterSegment, normalizeSegment, segmentLabel } = require('../shared/broadcast-service');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-09-05T00:00:00Z');
const users = [
  { telegram_id: '1', phone: '+998', language_code: 'uz', updated_at: new Date(now - 1 * DAY).toISOString() },
  { telegram_id: '2', phone: null, language_code: 'ru', updated_at: new Date(now - 60 * DAY).toISOString() },
  { telegram_id: '3', phone: '+998', webapp_lang: 'en', language_code: 'uz', updated_at: new Date(now - 45 * DAY).toISOString() },
];
const ctx = { now, buyers: new Set(['1']), recent: new Set(['1']), withBalance: new Set(['3']) };

test('filterSegment: all — hamma', () => {
  assert.deepEqual(filterSegment(users, 'all', ctx), ['1', '2', '3']);
});

test('filterSegment: raqam berganlar', () => {
  assert.deepEqual(filterSegment(users, 'with_phone', ctx), ['1', '3']);
});

test('filterSegment: xarid qilganlar / qilmaganlar', () => {
  assert.deepEqual(filterSegment(users, 'buyers', ctx), ['1']);
  assert.deepEqual(filterSegment(users, 'no_purchase', ctx), ['2', '3']);
});

test('filterSegment: balansi borlar', () => {
  assert.deepEqual(filterSegment(users, 'with_balance', ctx), ['3']);
});

test('filterSegment: 30 kun faol bo\'lmaganlar — oxirgi buyurtma ham, yangilanish ham 30 kundan eski', () => {
  assert.deepEqual(filterSegment(users, 'inactive_30d', ctx), ['2', '3']);
});

test('filterSegment: til — webapp_lang ustun, bo\'lmasa language_code', () => {
  assert.deepEqual(filterSegment(users, 'lang_uz', ctx), ['1']);
  assert.deepEqual(filterSegment(users, 'lang_ru', ctx), ['2']);
  assert.deepEqual(filterSegment(users, 'lang_en', ctx), ['3']);
});

test('normalizeSegment: noma\'lum segment "all" ga tushadi', () => {
  assert.equal(normalizeSegment('hacker'), 'all');
  assert.equal(normalizeSegment('buyers'), 'buyers');
  assert.equal(segmentLabel('nope'), segmentLabel('all'));
});
