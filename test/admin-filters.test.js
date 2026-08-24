const test = require('node:test');
const assert = require('node:assert');

// Admin paneldagi ikkita filtr tozalagichi. Ikkalasi ham PostgREST so'roviga
// to'g'ridan-to'g'ri qo'shiladi, shuning uchun filtr sintaksisini buzadigan
// belgilar (qavs, vergul, yulduzcha, qo'shtirnoq, teskari slesh) o'tib
// ketmasligi kerak — aks holda begona shart qo'shib yuborish mumkin.
const { _safeCode: safeCode } = require('../netlify/functions/admin-promos.js');
const { _sanitizeSearch: sanitizeSearch } = require('../netlify/functions/admin-orders.js');

test('safeCode: promokodni katta harfga o\'tkazadi va bo\'shliqni oladi', () => {
  assert.strictEqual(safeCode('  sale20 '), 'SALE20');
  assert.strictEqual(safeCode('yangi_yil-2026'), 'YANGI_YIL-2026');
});

test('safeCode: filtr sintaksisini buzadigan belgilarni olib tashlaydi', () => {
  // `,` va `)` bo'lsa `promo_code=eq.X` filtriga yangi shart qo'shib bo'lardi.
  assert.strictEqual(safeCode('A,B'), 'AB');
  assert.strictEqual(safeCode('X)or(1.eq.1'), 'XOR1EQ1');
  assert.strictEqual(safeCode('kod*'), 'KOD');
  assert.strictEqual(safeCode('a"b\\c'), 'ABC');
});

test('safeCode: bo\'sh va noto\'g\'ri kirishda bo\'sh satr', () => {
  assert.strictEqual(safeCode(''), '');
  assert.strictEqual(safeCode(null), '');
  assert.strictEqual(safeCode(undefined), '');
  assert.strictEqual(safeCode('()*,'), '');
});

test('safeCode: uzunlik 64 belgidan oshmaydi', () => {
  assert.strictEqual(safeCode('A'.repeat(200)).length, 64);
});

test('sanitizeSearch: oddiy qidiruvni o\'zgartirmaydi', () => {
  assert.strictEqual(sanitizeSearch(' ORD-1042 '), 'ORD-1042');
  assert.strictEqual(sanitizeSearch('856254490'), '856254490');
});

test('sanitizeSearch: or= filtrini buzadigan belgilarni olib tashlaydi', () => {
  // `*` PostgREST'da ilike joker belgisi — biz uni o'zimiz qo'shamiz,
  // foydalanuvchi kiritganini emas.
  assert.strictEqual(sanitizeSearch('a*b'), 'ab');
  // Qavs va vergul butunlay o'chadi, shuning uchun qo'shimcha shart `or=`
  // ro'yxatiga ajralib chiqolmaydi — bitta uzluksiz matn bo'lib qoladi.
  assert.strictEqual(sanitizeSearch('x),status.eq.approved,('), 'xstatus.eq.approved');
  assert.strictEqual(sanitizeSearch('a"b\\c'), 'abc');
});

test('sanitizeSearch: bo\'sh kirishda bo\'sh satr (filtr qo\'shilmaydi)', () => {
  assert.strictEqual(sanitizeSearch(''), '');
  assert.strictEqual(sanitizeSearch('   '), '');
  assert.strictEqual(sanitizeSearch(undefined), '');
});

test('sanitizeSearch: uzunlik 64 belgidan oshmaydi', () => {
  assert.strictEqual(sanitizeSearch('b'.repeat(500)).length, 64);
});
