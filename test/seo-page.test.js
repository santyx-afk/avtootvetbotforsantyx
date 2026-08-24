const test = require('node:test');
const assert = require('node:assert');

const { esc, jsonLd, money, paragraphs, slugify, layout } = require('../shared/seo-page.js');
const { GUIDES } = require('../shared/seo-guides.js');

// Bu sahifalar server tomonda chiziladi va ularga bazadagi matn (mahsulot
// tavsifi, kafolat) to'g'ridan-to'g'ri tushadi — ya'ni escape qilish
// xavfsizlik masalasi, ko'rinish emas.

test('esc: HTML belgilarini zararsizlantiradi', () => {
  assert.strictEqual(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(esc('a & b'), 'a &amp; b');
  assert.strictEqual(esc(`"tirnoq" 'apostrof'`), '&quot;tirnoq&quot; &#39;apostrof&#39;');
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
});

test('jsonLd: razmetka ichidan script tegini yopib bo\'lmaydi', () => {
  // Mahsulot nomida </script> bo'lsa, razmetka blokidan chiqib ketmasligi kerak.
  const out = jsonLd({ name: '</script><img src=x onerror=alert(1)>' });
  assert.ok(!out.includes('</script>'), 'yopuvchi teg xom holda qolmasligi kerak');
  assert.ok(out.includes('\\u003c'), '< belgisi kodlanishi kerak');
  // Kodlangan bo'lsa ham JSON sifatida o'qiladi.
  assert.doesNotThrow(() => JSON.parse(out.replace(/\\u003c/g, '<')));
});

test('money: uzbekcha format, butun songa yaxlitlaydi', () => {
  // uz-UZ formati uzilmaydigan bo'shliq (U+00A0) ishlatadi. Regexda uni
  // xom belgi sifatida yozib bo'lmaydi (no-irregular-whitespace), shuning
  // uchun kod bilan yoziladi.
  const nbsp = /\u00a0/g;
  assert.strictEqual(money(100000).replace(nbsp, ' '), '100 000');
  assert.strictEqual(money('64990.00').replace(nbsp, ' '), '64 990');
  assert.strictEqual(money(0), '0');
  assert.strictEqual(money(null), '0');
});

test('paragraphs: xatboshilarni ajratadi va escape qiladi', () => {
  const out = paragraphs('Birinchi qator\nikkinchi\n\nYangi xatboshi');
  assert.strictEqual(out, '<p>Birinchi qator<br>ikkinchi</p>\n<p>Yangi xatboshi</p>');
  assert.ok(paragraphs('<b>qalin</b>').includes('&lt;b&gt;'), 'HTML kirmasligi kerak');
  assert.strictEqual(paragraphs(''), '');
  assert.strictEqual(paragraphs(null), '');
});

test('slugify: URL uchun xavfsiz nom yasaydi', () => {
  assert.strictEqual(slugify('Canva Pro / Edu (1 yillik)'), 'canva-pro-edu-1-yillik');
  assert.strictEqual(slugify("Cap Cut pro 📲"), 'cap-cut-pro');
  assert.strictEqual(slugify('  --Adobe--  '), 'adobe');
  assert.strictEqual(slugify('🎬🎬🎬'), '');
  assert.strictEqual(slugify(null), '');
  assert.ok(slugify('a'.repeat(200)).length <= 60);
});

test('layout: majburiy SEO teglari joyida', () => {
  const html = layout({
    title: 'Sarlavha',
    description: 'Tavsif',
    canonical: 'https://santyx.uz/obuna/test',
    schemas: [{ '@type': 'Product', name: 'Test' }],
    body: '<main>salom</main>',
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="uz">'));
  assert.ok(html.includes('<title>Sarlavha</title>'));
  assert.ok(html.includes('name="description" content="Tavsif"'));
  assert.ok(html.includes('rel="canonical" href="https://santyx.uz/obuna/test"'));
  assert.ok(html.includes('name="robots" content="index, follow'));
  assert.ok(html.includes('application/ld+json'));
  assert.ok(html.includes('<main>salom</main>'));
});

test('layout: sarlavhadagi HTML escape qilinadi', () => {
  const html = layout({
    title: '<script>x</script>',
    description: 'd',
    canonical: 'https://santyx.uz/',
    body: '',
  });
  assert.ok(html.includes('<title>&lt;script&gt;x&lt;/script&gt;</title>'));
});

test('qo\'llanma matni to\'liq va tuzilishi to\'g\'ri', () => {
  const guide = GUIDES['ozbekistondan-tolash'];
  assert.ok(guide, 'asosiy qo\'llanma mavjud bo\'lishi kerak');
  assert.ok(guide.title && guide.description && guide.lede);
  assert.ok(guide.description.length <= 300, 'meta description juda uzun');
  assert.ok(guide.sections.length >= 4, 'kamida 4 ta bo\'lim');
  assert.ok(guide.faq.length >= 4, 'kamida 4 ta savol-javob');
  for (const f of guide.faq) {
    assert.ok(f.q && f.a, 'har bir savolda javob bo\'lishi kerak');
  }
  // Sana YYYY-MM-DD — sitemap'dagi lastmod shundan olinadi.
  assert.match(guide.updated, /^\d{4}-\d{2}-\d{2}$/);
});
