// Ochiq, qidiruvga mo'ljallangan sahifalar:
//   /obuna/<slug>      — bitta obuna sahifasi (narx bazadan jonli)
//   /qollanma/<slug>   — qo'llanma maqolasi
//
// Sahifalar to'liq HTML holida qaytariladi — JavaScript talab qilinmaydi.
// Sabab shared/seo-page.js boshida yozilgan: AI kraulerlari SPA'ni o'qiy olmaydi.

const { getAdminClient, request } = require('../../shared/db');
const {
  SITE_URL, BOT_URL, esc, money, paragraphs, layout,
} = require('../../shared/seo-page');
const { GUIDES } = require('../../shared/seo-guides');

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  // CDN uzoqroq, brauzer qisqaroq ushlaydi. Narx o'zgarsa bir soatda yangilanadi;
  // darhol kerak bo'lsa Netlify'da cache tozalanadi.
  'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
};

function notFound(message) {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
    body: layout({
      title: 'Sahifa topilmadi — santyx',
      description: 'Bunday sahifa mavjud emas.',
      canonical: `${SITE_URL}/`,
      body: `<main><div class="wrap">
        <h1>Sahifa topilmadi</h1>
        <p>${esc(message || 'Bunday manzil bo\'yicha sahifa yo\'q.')}</p>
        <div class="cta-row"><a class="cta" href="/">Bosh sahifaga</a></div>
      </div></main>`,
    }),
  };
}

// --- Obuna sahifasi ---------------------------------------------------------

async function renderPlan(db, slug) {
  const { data: plans } = await request(db, 'plans', {
    query: `select=*&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`,
  });
  const plan = plans?.[0];
  if (!plan) return notFound('Bunday obuna topilmadi yoki sotuvdan olingan.');

  // Boshqa obunalar — ichki havolalar uchun. Ichki havolalar qidiruv
  // tizimiga saytni to'liq aylanib chiqishga yordam beradi.
  const [{ data: others }, invCount] = await Promise.all([
    request(db, 'plans', {
      query: 'select=name,slug,price,currency&is_active=eq.true&parent_plan_id=is.null'
        + '&slug=not.is.null&order=sort_order.asc&limit=8',
    }).catch(() => ({ data: [] })),
    // Avtomatik yetkaziladigan obunalar uchun haqiqiy zaxira. Google
    // mavjudlikni yolg'on ko'rsatgan sahifalarni pasaytiradi.
    plan.delivery_type === 'auto_account' || plan.delivery_type === 'license_key'
      ? request(db, 'inventory_items', {
        query: `select=id&plan_id=eq.${encodeURIComponent(plan.id)}&status=eq.available`,
        headers: { Prefer: 'count=exact' },
      }).then((r) => r.count ?? 0).catch(() => null)
      : Promise.resolve(null),
  ]);

  const price = Number(plan.price || 0);
  const oldPrice = Number(plan.old_price || plan.official_price || 0);
  const savePct = oldPrice > price && oldPrice > 0
    ? Math.round(((oldPrice - price) / oldPrice) * 100)
    : 0;
  // invCount null = qo'lda yetkaziladi (zaxira tushunchasi yo'q) -> mavjud.
  const inStock = invCount === null || invCount > 0;

  const title = `${plan.name} — O'zbekistonda narxi ${money(price)} so'm | santyx`;
  const description = [
    `${plan.name} obunasi O'zbekistonda ${money(price)} ${plan.currency || 'UZS'}.`,
    plan.duration ? `Muddat: ${plan.duration}.` : '',
    "Humo/Uzcard bilan so'mda to'lanadi, Telegram orqali yetkaziladi.",
  ].filter(Boolean).join(' ').slice(0, 300);

  const canonical = `${SITE_URL}/obuna/${plan.slug}`;

  const faqItems = [
    {
      q: `${plan.name} narxi qancha?`,
      a: `${money(price)} ${plan.currency || 'UZS'}`
        + (plan.duration ? ` — ${plan.duration} muddatga.` : '.')
        + (savePct ? ` Rasmiy narxdan ${savePct}% arzon.` : ''),
    },
    {
      q: "O'zbekistondan qanday to'layman?",
      a: "Humo, Uzcard yoki boshqa mahalliy karta bilan so'mda to'laysiz. "
        + "Xalqaro karta kerak emas. To'lovni Telegram bot avtomatik aniqlaydi.",
    },
    plan.how_it_works_text ? {
      q: 'Obuna qanday ulanadi?',
      a: String(plan.how_it_works_text).replace(/\s+/g, ' ').trim().slice(0, 500),
    } : null,
    plan.warranty_text ? {
      q: 'Kafolat bormi?',
      a: String(plan.warranty_text).replace(/\s+/g, ' ').trim().slice(0, 500),
    } : null,
    {
      q: 'Qancha vaqtda keladi?',
      a: plan.delivery_type === 'auto_account' || plan.delivery_type === 'license_key'
        ? "To'lov tasdiqlangach avtomatik, odatda bir necha daqiqada."
        : "To'lov tasdiqlangach odatda 10–15 daqiqada.",
    },
  ].filter(Boolean);

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: plan.name,
      description: plan.description || description,
      ...(plan.image_url ? { image: plan.image_url } : {}),
      brand: { '@type': 'Brand', name: 'SANTYX' },
      offers: {
        '@type': 'Offer',
        url: canonical,
        price: String(price),
        priceCurrency: plan.currency || 'UZS',
        availability: inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: 'SANTYX', url: SITE_URL },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Bosh sahifa', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Obunalar', item: `${SITE_URL}/obuna` },
        { '@type': 'ListItem', position: 3, name: plan.name, item: canonical },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  const related = (others || [])
    .filter((o) => o.slug && o.slug !== plan.slug)
    .slice(0, 6)
    .map((o) => `<li><a href="/obuna/${esc(o.slug)}">
      <span class="n">${esc(o.name)}</span>
      <span class="p">${money(o.price)} ${esc(o.currency || 'UZS')}</span>
    </a></li>`).join('\n');

  const body = `<main><div class="wrap">
  <nav class="crumbs" aria-label="Yo'l">
    <a href="/">Bosh sahifa</a><span>›</span><span>${esc(plan.name)}</span>
  </nav>

  <h1>${esc(plan.name)} — O'zbekistonda narxi va sotib olish</h1>
  <p class="lede">${esc(plan.description || `${plan.name} obunasi O'zbekistonda so'mda, mahalliy karta bilan.`)}</p>

  <div class="pricebox">
    <div class="price-main">
      <span class="price-now">${money(price)} ${esc(plan.currency || 'UZS')}</span>
      ${oldPrice > price ? `<span class="price-was">Rasmiy narx ${money(oldPrice)}</span>` : ''}
    </div>
    ${savePct ? `<span class="save">${savePct}% arzon</span>` : ''}
    <div class="price-meta">
      ${plan.duration ? `<span>Muddat</span><b>${esc(plan.duration)}</b>` : ''}
      <span class="stock ${inStock ? 'in' : 'out'}">${inStock ? '● Mavjud' : '○ Vaqtincha tugagan'}</span>
    </div>
  </div>

  <div class="cta-row">
    <a class="cta" href="${BOT_URL}" rel="noopener">Telegram orqali sotib olish</a>
    <span class="cta-note">Humo · Uzcard · so'mda to'lov</span>
  </div>

  <ul class="facts">
    <li><span class="k">To'lov</span><span class="v">Mahalliy karta, so'mda</span></li>
    <li><span class="k">Yetkazish</span><span class="v">${
      plan.delivery_type === 'auto_account' || plan.delivery_type === 'license_key'
        ? 'Avtomatik, bir necha daqiqada' : '10–15 daqiqada'
    }</span></li>
    ${plan.duration ? `<li><span class="k">Muddat</span><span class="v">${esc(plan.duration)}</span></li>` : ''}
    <li><span class="k">Qo'llab-quvvatlash</span><span class="v">Telegram, har kuni</span></li>
  </ul>

  ${plan.how_it_works_text ? `<h2>Obuna qanday ulanadi</h2>${paragraphs(plan.how_it_works_text)}` : ''}
  ${plan.warranty_text ? `<h2>Kafolat</h2>${paragraphs(plan.warranty_text)}` : ''}
  ${plan.rules_text ? `<h2>Foydalanish qoidalari</h2>${paragraphs(plan.rules_text)}` : ''}

  <div class="callout">
    <p><strong>Xalqaro kartangiz yo'qmi?</strong> Bu obunani olish uchun kerak emas —
    Humo yoki Uzcard bilan so'mda to'laysiz.</p>
    <p><a href="/qollanma/ozbekistondan-tolash">O'zbekistondan xalqaro obunalarga to'lashning barcha yo'llari →</a></p>
  </div>

  <h2>Ko'p so'raladigan savollar</h2>
  ${faqItems.map((f) => `<details class="faq">
    <summary>${esc(f.q)}</summary>
    <p>${esc(f.a)}</p>
  </details>`).join('\n')}

  ${related ? `<h2>Boshqa obunalar</h2><ul class="related">${related}</ul>` : ''}

  <div class="cta-row" style="margin-top:34px">
    <a class="cta" href="${BOT_URL}" rel="noopener">${esc(plan.name)} — sotib olish</a>
  </div>
</div></main>`;

  return {
    statusCode: 200,
    headers: HTML_HEADERS,
    body: layout({ title, description, canonical, schemas, body }),
  };
}

// --- Obunalar ro'yxati (/obuna) ---------------------------------------------
// Bitta joyda hamma obuna — qidiruv tizimi shu sahifadan har bir mahsulotga
// o'tadi, foydalanuvchi esa narxlarni yonma-yon ko'radi.

async function renderPlanIndex(db) {
  const { data: plans } = await request(db, 'plans', {
    query: 'select=name,slug,price,currency,duration,description&is_active=eq.true'
      + '&parent_plan_id=is.null&slug=not.is.null&order=sort_order.asc',
  });
  const list = plans || [];
  const canonical = `${SITE_URL}/obuna`;

  const rows = list.map((p) => `<li><a href="/obuna/${esc(p.slug)}">
    <span class="n">${esc(p.name)}</span>
    <span class="p">${money(p.price)} ${esc(p.currency || 'UZS')}${p.duration ? ` · ${esc(p.duration)}` : ''}</span>
  </a></li>`).join('\n');

  const schemas = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: "santyx obunalari",
    itemListElement: list.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: `${SITE_URL}/obuna/${p.slug}`,
    })),
  }];

  const body = `<main><div class="wrap">
  <nav class="crumbs" aria-label="Yo'l"><a href="/">Bosh sahifa</a><span>›</span><span>Obunalar</span></nav>
  <h1>Premium obunalar — O'zbekistondagi narxlar</h1>
  <p class="lede">
    Barcha obunalar so'mda, Humo yoki Uzcard bilan to'lanadi. Xalqaro karta kerak emas.
    Har bir obunaning kafolat muddati va ulanish usuli o'z sahifasida yozilgan.
  </p>
  <ul class="related" style="margin-top:26px">${rows}</ul>
  <div class="callout">
    <p><strong>Qaysi biri sizga kerakligini bilmayapsizmi?</strong>
    Telegram botda barcha obunalar toifalar bo'yicha ajratilgan.</p>
    <p><a href="${BOT_URL}" rel="noopener">Botni ochish →</a></p>
  </div>
  <h2>O'zbekistondan qanday to'lanadi</h2>
  <p>
    Humo va Uzcard xalqaro to'lovlarni qabul qilmaydi, shuning uchun Canva yoki Adobe
    saytida to'g'ridan-to'g'ri to'lab bo'lmaydi. Bu yerda esa siz mahalliy karta bilan
    so'mda to'laysiz — xalqaro to'lovni biz bajaramiz.
  </p>
  <p><a href="/qollanma/ozbekistondan-tolash">Barcha to'lov yo'llari va ularning kamchiliklari →</a></p>
</div></main>`;

  return {
    statusCode: 200,
    headers: HTML_HEADERS,
    body: layout({
      title: "Premium obunalar — O'zbekistonda narxlari | santyx",
      description: "CapCut Pro, Canva Pro, Adobe Creative Cloud, Gemini AI va boshqa "
        + "premium obunalar O'zbekistonda so'mda. Humo/Uzcard bilan to'lov, Telegram orqali yetkazish.",
      canonical,
      schemas,
      body,
    }),
  };
}

// --- Qo'llanma sahifasi -----------------------------------------------------

function renderGuide(slug) {
  const guide = GUIDES[slug];
  if (!guide) return notFound('Bunday qo\'llanma topilmadi.');

  const canonical = `${SITE_URL}/qollanma/${slug}`;
  const sections = guide.sections.map((s) => `
    <h2>${esc(s.h)}</h2>
    ${(s.p || []).map((t) => `<p>${esc(t)}</p>`).join('\n')}
    ${s.bullets ? `<ul class="bullets">${s.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>` : ''}
  `).join('\n');

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.title,
      description: guide.description,
      inLanguage: 'uz',
      dateModified: guide.updated,
      author: { '@type': 'Organization', name: 'SANTYX', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'SANTYX', url: SITE_URL },
      mainEntityOfPage: canonical,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: guide.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Bosh sahifa', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: guide.title, item: canonical },
      ],
    },
  ];

  const body = `<main><div class="wrap">
  <nav class="crumbs" aria-label="Yo'l">
    <a href="/">Bosh sahifa</a><span>›</span><span>Qo'llanma</span>
  </nav>

  <h1>${esc(guide.title)}</h1>
  <p class="lede">${esc(guide.lede)}</p>
  <p style="font-size:14px;color:var(--ink-faint)">Yangilangan: ${esc(guide.updated)}</p>

  ${sections}

  <h2>Ko'p so'raladigan savollar</h2>
  ${guide.faq.map((f) => `<details class="faq">
    <summary>${esc(f.q)}</summary>
    <p>${esc(f.a)}</p>
  </details>`).join('\n')}

  ${guide.closing ? `<h2>${esc(guide.closing.h)}</h2>
  ${guide.closing.p.map((t) => `<p>${esc(t)}</p>`).join('\n')}
  <div class="cta-row"><a class="cta" href="/">Obunalar va narxlar</a></div>` : ''}
</div></main>`;

  return {
    statusCode: 200,
    headers: HTML_HEADERS,
    body: layout({
      title: guide.metaTitle || guide.title,
      description: guide.description,
      canonical,
      schemas,
      body,
    }),
  };
}

// --- Yo'naltiruvchi ---------------------------------------------------------

// Slug faqat kichik harf, raqam va chiziqcha bo'lishi mumkin — boshqasi
// bazaga so'rov qilinmasdan rad etiladi.
const SLUG_RE = /^[a-z0-9-]{1,60}$/;

exports.handler = async (event) => {
  // Bo'lim va slug netlify.toml dagi rewrite orqali so'rov parametri sifatida
  // keladi — bu eng ishonchli manba. Agar funksiya boshqa yo'l bilan
  // chaqirilsa (masalan to'g'ridan-to'g'ri /.netlify/functions/... orqali),
  // manzilning o'zidan o'qiymiz.
  const params = event.queryStringParameters || {};
  let section = params.section;
  let slug = params.slug;

  if (!section) {
    let pathname = String(event.path || '');
    if (!pathname || pathname.includes('/.netlify/functions/')) {
      try {
        pathname = new URL(event.rawUrl).pathname;
      } catch {
        /* rawUrl yo'q — event.path bilan davom etamiz */
      }
    }
    [section, slug] = pathname.split('?')[0].split('/').filter(Boolean);
  }

  try {
    // /obuna — barcha obunalar ro'yxati
    if (section === 'obuna' && !slug) return renderPlanIndex(getAdminClient());
    if (!slug || !SLUG_RE.test(slug)) return notFound();
    if (section === 'qollanma') return renderGuide(slug);
    if (section === 'obuna') return renderPlan(getAdminClient(), slug);
    return notFound();
  } catch (error) {
    console.error('seo-page error', error?.message);
    // Xato bo'lsa ham 404 emas, 500 qaytaramiz: 404 bo'lsa Google sahifani
    // indeksdan olib tashlaydi, 500 esa "keyinroq qayta urin" degani.
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<!doctype html><meta charset="utf-8"><title>Xatolik</title><p>Sahifani yuklab bo\'lmadi. Birozdan keyin urinib ko\'ring.</p>',
    };
  }
};
