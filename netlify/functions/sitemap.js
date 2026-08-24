// sitemap.xml — jonli generatsiya qilinadi.
//
// Ilgari u build paytida statik yozilardi va yangi obuna qo'shilganda
// eskirib qolardi (build qilinmaguncha Google uni ko'rmasdi). Endi ro'yxat
// har so'rovda bazadan olinadi: admin panelda yangi reja yaratilib, unga
// slug berilsa — sitemap'da darrov paydo bo'ladi.

const { getAdminClient, request } = require('../../shared/db');
const { SITE_URL } = require('../../shared/seo-page');
const { GUIDES } = require('../../shared/seo-guides');

// Qidiruv tizimlari ochiq ko'radigan doimiy sahifalar.
const STATIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/obuna', changefreq: 'weekly', priority: '0.9' },
  { path: '/login', changefreq: 'monthly', priority: '0.4' },
  { path: '/maxfiylik', changefreq: 'yearly', priority: '0.2' },
  { path: '/shartlar', changefreq: 'yearly', priority: '0.2' },
];

function urlTag({ loc, lastmod, changefreq, priority }) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

exports.handler = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = STATIC_ROUTES.map((r) => urlTag({
    loc: `${SITE_URL}${r.path}`,
    lastmod: today,
    changefreq: r.changefreq,
    priority: r.priority,
  }));

  // Qo'llanmalar — matn kamdan-kam o'zgaradi, sanasi maqolaning o'zidan.
  for (const [slug, guide] of Object.entries(GUIDES)) {
    urls.push(urlTag({
      loc: `${SITE_URL}/qollanma/${slug}`,
      lastmod: guide.updated || today,
      changefreq: 'monthly',
      priority: '0.8',
    }));
  }

  // Obunalar. Baza javob bermasa ham sitemap qaytadi — statik qismi
  // baribir foydali, bo'sh 500 dan ko'ra yaxshiroq.
  try {
    const { data: plans } = await request(getAdminClient(), 'plans', {
      query: 'select=slug,updated_at&is_active=eq.true&parent_plan_id=is.null&slug=not.is.null',
    });
    for (const plan of plans || []) {
      urls.push(urlTag({
        loc: `${SITE_URL}/obuna/${plan.slug}`,
        lastmod: (plan.updated_at || today).slice(0, 10),
        changefreq: 'weekly',
        priority: '0.9',
      }));
    }
  } catch (error) {
    console.warn('sitemap plans warn:', error?.message);
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`,
  };
};
