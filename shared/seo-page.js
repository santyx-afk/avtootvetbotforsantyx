// Qidiruv tizimlari va AI botlari uchun server tomonda chiziladigan sahifalar.
//
// Nima uchun server tomonda:
//   Sayt — React SPA, ya'ni sahifa mazmuni brauzerda JavaScript ishlagach
//   paydo bo'ladi. Google JS ni ishlata oladi, lekin AI kraulerlari
//   (GPTBot, ClaudeBot, PerplexityBot, Bingbot'ning bir qismi) ko'pincha
//   ishlatmaydi — ular uchun SPA bo'sh sahifa. Shu sabab bu sahifalar
//   to'liq HTML holida, JavaScript'siz o'qiladigan qilib beriladi.
//
// Narx va mahsulot ma'lumoti har so'rovda bazadan olinadi, shuning uchun
// admin panelda narx o'zgartirilsa sahifada ham darrov o'zgaradi.

const SITE_URL = 'https://santyx.uz';
const BOT_URL = `https://t.me/${process.env.BOT_USERNAME || 'santyxnarxbot'}`;
const CHANNEL_URL = 'https://t.me/santyx_pro';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
}

// JSON-LD `</script>` bilan yopilib ketmasligi uchun (razmetka ichida
// foydalanuvchi kiritgan matn bo'lishi mumkin).
function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(value || 0)));
}

// Matnni xatboshilarga bo'lib, HTML paragraflarga aylantiradi.
// Admin panelda matn oddiy textarea'ga yoziladi, ya'ni faqat yangi qatorlar bor.
function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Sahifa qolipi. Uslub inline — tashqi CSS fayli yana bitta so'rov qo'shadi,
// bu sahifalar esa imkon qadar tez ochilishi kerak (Google reyting omili).
function layout({ title, description, canonical, extraHead = '', schemas = [], body }) {
  const schemaTags = schemas
    .filter(Boolean)
    .map((s) => `<script type="application/ld+json">${jsonLd(s)}</script>`)
    .join('\n');

  return `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="santyx">
<meta property="og:locale" content="uz_UZ">
<meta property="og:image" content="${SITE_URL}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap">
${extraHead}
${schemaTags}
<style>
:root{
  --bg:#0B0D11; --surface:#14171E; --surface-2:#1B1F28;
  --ink:#EDF0F5; --ink-soft:#9AA3B2; --ink-faint:#6E7787;
  --rule:#242A34; --accent:#4C8DFF; --accent-soft:#1B2B4A;
  --win:#3FCF8E; --win-bg:#10281F;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;background:var(--bg);color:var(--ink);
  font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;
}
a{color:var(--accent);text-underline-offset:2px}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
img{max-width:100%;height:auto}
.wrap{max-width:820px;margin:0 auto;padding:0 20px}

header.site{border-bottom:1px solid var(--rule);padding:18px 0}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{font-weight:800;font-size:19px;letter-spacing:.14em;color:var(--ink);text-decoration:none}
.site-nav{display:flex;gap:18px;font-size:15px;font-weight:500}
.site-nav a{color:var(--ink-soft);text-decoration:none}
.site-nav a:hover{color:var(--ink)}

nav.crumbs{font-size:14px;color:var(--ink-faint);padding:20px 0 0}
nav.crumbs a{color:var(--ink-faint);text-decoration:none}
nav.crumbs a:hover{color:var(--ink-soft);text-decoration:underline}
nav.crumbs span{margin:0 6px}

main{padding:8px 0 64px}
h1{font-size:clamp(28px,5vw,40px);line-height:1.12;letter-spacing:-.025em;font-weight:800;margin:18px 0 12px;text-wrap:balance}
h2{font-size:23px;line-height:1.25;letter-spacing:-.015em;font-weight:700;margin:44px 0 14px;text-wrap:balance}
h3{font-size:18px;font-weight:700;margin:26px 0 8px}
p{margin:0 0 14px;color:var(--ink-soft);max-width:66ch}
p strong,li strong{color:var(--ink);font-weight:700}
.lede{font-size:19px;color:var(--ink-soft);max-width:64ch}

.pricebox{
  background:var(--surface);border:1px solid var(--rule);border-radius:14px;
  padding:22px 24px;margin:26px 0;display:flex;flex-wrap:wrap;gap:22px 32px;align-items:flex-end;
}
.price-main{display:flex;flex-direction:column;gap:2px}
.price-now{font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.price-was{font-size:15px;color:var(--ink-faint);text-decoration:line-through;font-variant-numeric:tabular-nums}
.price-meta{display:flex;flex-direction:column;gap:2px;font-size:14px;color:var(--ink-faint)}
.price-meta b{color:var(--ink);font-weight:700;font-size:15px}
.save{
  background:var(--win-bg);color:var(--win);font-weight:700;font-size:14px;
  padding:4px 10px;border-radius:6px;align-self:center;white-space:nowrap;
}
.stock{font-size:14px;font-weight:700}
.stock.in{color:var(--win)}
.stock.out{color:var(--ink-faint)}

.cta{
  display:inline-block;background:var(--accent);color:#fff;text-decoration:none;
  font-weight:700;font-size:16px;padding:14px 26px;border-radius:10px;
}
.cta:hover{filter:brightness(1.08)}
.cta-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:22px 0}
.cta-note{font-size:14px;color:var(--ink-faint)}

.facts{
  list-style:none;padding:0;margin:18px 0;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;
}
.facts li{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:14px 16px}
.facts .k{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:3px}
.facts .v{font-weight:700;font-size:15.5px}

ul.bullets{margin:0 0 16px;padding-left:22px;color:var(--ink-soft);max-width:66ch}
ul.bullets li{margin-bottom:7px}

details.faq{border-bottom:1px solid var(--rule);padding:14px 0}
details.faq summary{cursor:pointer;font-weight:700;font-size:16.5px;list-style:none;display:flex;justify-content:space-between;gap:14px}
details.faq summary::-webkit-details-marker{display:none}
details.faq summary::after{content:"+";color:var(--ink-faint);font-weight:500}
details.faq[open] summary::after{content:"−"}
details.faq p{margin:10px 0 0}

.related{list-style:none;padding:0;margin:16px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.related a{
  display:flex;flex-direction:column;gap:4px;background:var(--surface);border:1px solid var(--rule);
  border-radius:10px;padding:14px 16px;text-decoration:none;
}
.related a:hover{border-color:var(--accent)}
.related .n{color:var(--ink);font-weight:700;font-size:15.5px}
.related .p{color:var(--ink-faint);font-size:14px;font-variant-numeric:tabular-nums}

.callout{background:var(--accent-soft);border-radius:12px;padding:18px 22px;margin:26px 0}
.callout p{margin:0;color:var(--ink)}
.callout p + p{margin-top:10px}

footer.site{border-top:1px solid var(--rule);padding:28px 0 40px;margin-top:40px}
footer.site .wrap{display:flex;flex-wrap:wrap;gap:10px 24px;justify-content:space-between;font-size:14px;color:var(--ink-faint)}
footer.site a{color:var(--ink-faint);text-decoration:none}
footer.site a:hover{color:var(--ink-soft)}

@media (max-width:560px){
  body{font-size:16px}
  .pricebox{gap:16px 24px;padding:18px}
  .price-now{font-size:29px}
}
</style>
</head>
<body>
<header class="site">
  <div class="wrap">
    <a class="brand" href="/">SANTYX</a>
    <nav class="site-nav">
      <a href="/">Bosh sahifa</a>
      <a href="/qollanma/ozbekistondan-tolash">Qanday to'lanadi</a>
      <a href="${BOT_URL}" rel="noopener">Telegram bot</a>
    </nav>
  </div>
</header>
${body}
<footer class="site">
  <div class="wrap">
    <span>© ${new Date().getFullYear()} SANTYX — O'zbekistonda premium obunalar</span>
    <span>
      <a href="/maxfiylik">Maxfiylik</a> ·
      <a href="/shartlar">Shartlar</a> ·
      <a href="${CHANNEL_URL}" rel="noopener">Telegram kanal</a>
    </span>
  </div>
</footer>
</body>
</html>`;
}

module.exports = {
  SITE_URL,
  BOT_URL,
  CHANNEL_URL,
  esc,
  jsonLd,
  money,
  paragraphs,
  slugify,
  layout,
};
