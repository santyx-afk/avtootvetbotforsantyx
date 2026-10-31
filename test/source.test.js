const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSourceSlug,
  parseStartPayloadSource,
  parseWebSource,
  sourceLabel,
  sourceKind,
} = require('../shared/source');

test('normalizeSourceSlug: faqat [a-z0-9_-], 40 belgi', () => {
  assert.equal(normalizeSourceSlug('Instagram Bio'), 'instagram_bio');
  assert.equal(normalizeSourceSlug('  REELS-07  '), 'reels-07');
  assert.equal(normalizeSourceSlug('Инстаграм'), null, 'kirill harflari tashlanadi');
  assert.equal(normalizeSourceSlug('a__b___c'), 'a_b_c', 'takroriy ajratuvchilar birlashadi');
  assert.equal(normalizeSourceSlug('___'), null);
  assert.equal(normalizeSourceSlug(''), null);
  assert.equal(normalizeSourceSlug(null), null);
  // 40 belgidan keyin kesiladi va oxirida ajratuvchi qolmaydi
  const long = normalizeSourceSlug('a'.repeat(39) + '_bbb');
  assert.equal(long.length, 39);
  assert.ok(!long.endsWith('_'));
});

test('parseStartPayloadSource: deep-link shakllari', () => {
  assert.equal(parseStartPayloadSource('src_instagram_bio'), 'instagram_bio');
  assert.equal(parseStartPayloadSource('reels_7'), 'reels_07', 'bir xonali raqam ikki xonaga keltiriladi');
  assert.equal(parseStartPayloadSource('reels_07'), 'reels_07');
  assert.equal(parseStartPayloadSource('Reels-7'), 'reels_07');
  assert.equal(parseStartPayloadSource('ref_123456'), 'referral', 'referal — alohida kanal');
});

test('parseStartPayloadSource: ichki buyruqlar manba emas', () => {
  // Bu ikkisi botning funksional payload'lari. Manba deb yozilsa, saytdan
  // login qilgan har bir odam "web_login" manbasiga tushib, hisobotni
  // buzardi.
  assert.equal(parseStartPayloadSource('web_login'), null);
  assert.equal(parseStartPayloadSource('support'), null);
  assert.equal(parseStartPayloadSource(''), null);
  assert.equal(parseStartPayloadSource(undefined), null);
});

test('parseStartPayloadSource: tanilmagan payload ham manba sifatida qabul qilinadi', () => {
  // Yangi havolani kodga tegmasdan ishga tushirish mumkin bo'lsin.
  assert.equal(parseStartPayloadSource('blogger_aziz'), 'blogger_aziz');
});

test('parseWebSource: utm_content dagi Reels kodi utm_source dan ustun', () => {
  const params = new URLSearchParams('utm_source=instagram&utm_content=reels_7');
  assert.equal(parseWebSource(params), 'reels_07');
});

test('parseWebSource: src, utm_source, ref tartibi', () => {
  assert.equal(parseWebSource(new URLSearchParams('src=chatla_dm')), 'chatla_dm');
  assert.equal(parseWebSource(new URLSearchParams('utm_source=Instagram')), 'instagram');
  assert.equal(parseWebSource(new URLSearchParams('ref=blogger')), 'blogger');
  // utm_content ma'nosiz qiymat bo'lsa e'tiborga olinmaydi
  assert.equal(parseWebSource(new URLSearchParams('utm_source=instagram&utm_content=button1')), 'instagram');
  assert.equal(parseWebSource(new URLSearchParams('')), null);
  // oddiy obyekt ham ishlaydi (URLSearchParams shart emas)
  assert.equal(parseWebSource({ src: 'telegram_channel' }), 'telegram_channel');
});

test('sourceLabel / sourceKind', () => {
  assert.equal(sourceLabel('reels_03'), 'Reels #03');
  assert.equal(sourceLabel('instagram_bio'), 'Instagram bio');
  assert.equal(sourceLabel('reels_03', { reels_03: { label: 'Reels: CapCut xatolari' } }), 'Reels: CapCut xatolari');
  assert.equal(sourceKind('reels_11'), 'reels');
  assert.equal(sourceKind('instagram_story'), 'instagram');
  assert.equal(sourceKind('telegram_channel'), 'telegram');
  assert.equal(sourceKind('chatla_dm'), 'chatla');
  assert.equal(sourceKind('website'), 'web');
  assert.equal(sourceKind('referral'), 'referral');
  assert.equal(sourceKind('blogger_aziz'), 'other');
  assert.equal(sourceKind(null), 'other');
});
