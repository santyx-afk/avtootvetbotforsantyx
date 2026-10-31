import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCall } from '../lib/api.js';
import { formatPrice, formatNumber } from '../utils/format.js';
import { botLinkWithSource, captureSource } from '../utils/source.js';
import useModalDismiss from '../hooks/useModalDismiss.js';
import BrandLogo from '../components/BrandLogo.jsx';
import StructuredData from '../components/StructuredData.jsx';
import usePageMeta from '../hooks/usePageMeta.js';
import LangPicker from '../components/LangPicker.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import styles from './Landing.module.css';

const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');
const SUPPORT = (import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace(/^@/, '');
const BOT_URL = `https://t.me/${BOT}`;
const CHANNEL_URL = 'https://t.me/santyx_pro';
const INSTAGRAM_URL = 'https://instagram.com/santyx.uz';

// Katalog sessiyaga keshlanadi — sahifaga qayta kirilganda ro'yxat
// so'rov kutmasdan darhol chiziladi.
const CACHE_KEY = 'santyx:landing:catalog';
const STATS_CACHE_KEY = 'santyx:landing:stats';

// Ijtimoiy isbot raqamlarini PASTGA yaxlitlaydi.
//
// Nima uchun pastga: "1000+ mijoz" degan yozuv haqiqatdan oshib ketmasligi
// kerak. 1 247 mijoz bo'lsa "1 200+" ko'rsatiladi — ya'ni o'qigan odam
// ko'rgan raqam har doim kamida shuncha mijoz borligini bildiradi.
// 10 tadan kam bo'lsa yaxlitlash ma'nosiz, aniq son chiqadi.
function roundedCount(raw) {
  const value = Math.max(0, Math.floor(Number(raw || 0)));
  if (value < 10) return { value, plus: false };
  const step = value >= 1000 ? 100 : value >= 100 ? 50 : 10;
  return { value: Math.floor(value / step) * step, plus: true };
}

function readStatsCache() {
  try {
    const raw = sessionStorage.getItem(STATS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}





// schema.org razmetkasi. FAQ ro'yxatidan avtomatik quriladi — savollar
// o'zgarsa razmetka ham o'z-o'zidan yangilanadi, ikki joyda saqlash shart emas.
const SITE_URL = 'https://santyx.uz';

const ORG_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'SANTYX',
  alternateName: 'Santyx Pro',
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description: 'Premium obunalar hamyonbop narxlarda — CapCut, Canva, Adobe, Gemini AI va boshqalar.',
  sameAs: [CHANNEL_URL, INSTAGRAM_URL, BOT_URL],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: `https://t.me/${SUPPORT}`,
    availableLanguage: ['uz', 'ru', 'en'],
  },
};

// FAQ razmetkasi joriy tildagi savollardan quriladi.
function buildFaqSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

// Kategoriya nomlaridagi bezak emojilarni ko'rsatishda olib tashlaymiz.
function cleanName(name) {
  return String(name || '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Ko'ringanda fade-in. `deps` o'zgarganda qayta bog'lanadi — ilgari bu effekt
// bog'liqliklarsiz edi va HAR renderda butun DOM'ni qayta so'rab, yangi
// IntersectionObserver yaratardi.
function useReveal(deps) {
  useEffect(() => {
    const els = document.querySelectorAll(`.${styles.reveal}:not(.${styles.visible})`);
    if (!els.length) return undefined;

    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add(styles.visible));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add(styles.visible);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: '80px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps);
}

function ProductCard({ p, botUrl, t }) {
  const discount =
    p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  const bundleItems = Array.isArray(p.bundle_items) ? p.bundle_items : [];
  return (
    <a className={styles.card} href={botUrl} target="_blank" rel="noopener noreferrer">
      <div className={styles.cardImg}>
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" width="160" height="160" />
        ) : (
          <span className={styles.cardImgFallback} aria-hidden="true" />
        )}
        {discount > 0 && <span className={styles.badge}>-{discount}%</span>}
        {p.is_bundle && <span className={styles.bundleBadge}>{t('landing.prices.bundleBadge')}</span>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{p.name}</div>
        {/* To'plam tarkibi: mijoz nima uchun to'layotganini KO'RISHI kerak,
            aks holda nomdan boshqa hech qanday ma'lumot yo'q. */}
        {bundleItems.length > 0 && (
          <div className={styles.bundleList}>
            {bundleItems.map((item) => (
              <span key={`${item.name}-${item.duration}`}>
                {item.name}
                {item.quantity > 1 ? ` x${item.quantity}` : ''}
              </span>
            ))}
          </div>
        )}
        {(p.duration || p.rating?.count > 0) && (
          <div className={styles.cardMeta}>
            {p.duration}
            {p.duration && p.rating?.count > 0 ? ' · ' : ''}
            {p.rating?.count > 0 ? `${p.rating.avg} / 5` : ''}
          </div>
        )}
        <div className={styles.cardPrices}>
          <span className={styles.price}>{formatPrice(p.price, p.currency || 'UZS')}</span>
          {p.old_price > p.price && (
            <span className={styles.oldPrice}>{formatPrice(p.old_price, p.currency || 'UZS')}</span>
          )}
        </div>
      </div>
    </a>
  );
}

// Lead formasi — tashrifchi izlagan obunasini topolmasa, so'rov qoldiradi.
// Muvaffaqiyatli yuborilgach admin panel "Leadlar" bo'limiga tushadi va
// adminga bot orqali xabar boradi.
function LeadModal({ onClose }) {
  const { t } = useI18n();
  const [wanted, setWanted] = useState('');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — odam ko'rmaydi
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  // Server chastota chegarasiga urilganda alohida xabar ko'rsatamiz.
  const [rateLimited, setRateLimited] = useState(false);
  useModalDismiss(status === 'sending' ? null : onClose);

  const submit = async (event) => {
    event.preventDefault();
    if (!wanted.trim() || !contact.trim()) return;
    setStatus('sending');
    setRateLimited(false);
    try {
      await apiCall('submit-lead', { wanted: wanted.trim(), contact: contact.trim(), website });
      setStatus('done');
    } catch (err) {
      setRateLimited(err?.message === 'too_many_requests');
      setStatus('error');
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={status === 'sending' ? undefined : onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('landing.lead.cta')}
        onClick={(event) => event.stopPropagation()}
      >
        {status === 'done' ? (
          <>
            <h3 className={styles.modalTitle}>{t('landing.lead.doneTitle')}</h3>
            <p className={styles.modalText}>{t('landing.lead.doneText')}</p>
            <button type="button" className={styles.cta} onClick={onClose}>
              {t('common.close')}
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h3 className={styles.modalTitle}>{t('landing.lead.modalTitle')}</h3>
            <p className={styles.modalText}>{t('landing.lead.modalText')}</p>
            <label className={styles.field}>
              <span>{t('landing.lead.fieldWanted')}</span>
              <input
                value={wanted}
                onChange={(event) => setWanted(event.target.value)}
                required
                maxLength={300}
                placeholder={t('landing.lead.placeholderWanted')}
              />
            </label>
            <label className={styles.field}>
              <span>{t('landing.lead.fieldContact')}</span>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                required
                maxLength={120}
                placeholder={t('landing.lead.placeholderContact')}
              />
            </label>
            <input
              className={styles.hp}
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              placeholder="website"
            />
            {status === 'error' && (
              <p className={styles.formError}>
                {rateLimited ? (
                  t('landing.lead.tooMany')
                ) : (
                  <>
                    {t('landing.lead.errorBefore')}
                    <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
                      @{SUPPORT}
                    </a>
                    {t('landing.lead.errorAfter')}
                  </>
                )}
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.ctaGhost}
                onClick={onClose}
                disabled={status === 'sending'}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className={styles.cta} disabled={status === 'sending'}>
                {status === 'sending' ? t('landing.lead.sending') : t('landing.lead.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { t } = useI18n();
  // Keshdan boshlaymiz — birinchi chizishda bo'sh joy ko'rinmaydi.
  const [data, setData] = useState(() => readCache() || { products: [], categories: [], allProducts: [] });
  const [loaded, setLoaded] = useState(() => Boolean(readCache()));
  const [stats, setStats] = useState(() => readStatsCache());
  const [leadOpen, setLeadOpen] = useState(false);
  const productsRef = useRef(null);
  const pricesRef = useRef(null);

  const { products, categories, allProducts = [] } = data;

  // Botga havola trafik manbasi bilan: reklamadan kelgan odam ?start=src_...
  // bilan botga tushadi va admin panelda qaysi havola sotuv keltirgani
  // ko'rinadi. captureSource() birinchi teginishni localStorage'da saqlaydi,
  // shuning uchun odam saytda bir necha sahifa aylansa ham manba yo'qolmaydi.
  const botUrl = useMemo(() => botLinkWithSource(BOT, captureSource()), []);

  usePageMeta({
    title: t('landing.meta.title'),
    description: t('landing.meta.description'),
    path: '/',
  });
  const closeLead = useCallback(() => setLeadOpen(false), []);

  // Ro'yxatlar joriy tildan olinadi (t() massiv qaytaradi).
  const steps = t('landing.how.steps');
  const advantages = t('landing.why.items');
  const perks = t('landing.perks.items');
  const faq = t('landing.faq.items');

  useEffect(() => {
    let active = true;
    apiCall('public-catalog')
      .then((res) => {
        if (!active) return;
        const all = (res.products || []).slice();
        const next = {
          products: all
            .slice()
            .sort((a, b) => Number(b.is_popular) - Number(a.is_popular))
            .slice(0, 8),
          // Narxlar jadvali uchun TO'LIQ ro'yxat: kartalar faqat 8 ta mashhurini
          // ko'rsatadi, tashrifchi esa ko'pincha "hammasi qanchadan?" deb
          // keladi va javobni botga kirmasdan ko'rishi kerak.
          allProducts: all
            .slice()
            .sort((a, b) => Number(b.is_bundle) - Number(a.is_bundle) || Number(a.price) - Number(b.price)),
          categories: (res.categories || []).slice(0, 12),
        };
        setData(next);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* kesh ixtiyoriy */
        }
      })
      .catch(() => {})
      .finally(() => active && setLoaded(true));

    // Ijtimoiy isbot raqamlari alohida so'rov bilan: katalogdan mustaqil,
    // biri ishlamasa ikkinchisi baribir chiqadi.
    apiCall('public-stats')
      .then((res) => {
        if (!active || !res?.stats) return;
        setStats(res.stats);
        try {
          sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(res.stats));
        } catch {
          /* kesh ixtiyoriy */
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Sharhlar bo'yicha umumiy ko'rsatkich.
  // public-stats BARCHA sharhlarni qamraydi, katalogdan hisoblash esa faqat
  // ko'rsatilgan 8 mahsulotni — shuning uchun ikkinchisi faqat zaxira
  // (statistika so'rovi ishlamasa sahifa baribir reytingni ko'rsatadi).
  const catalogReviews = products.reduce(
    (acc, p) => {
      const c = Number(p.rating?.count || 0);
      if (!c) return acc;
      return { count: acc.count + c, sum: acc.sum + Number(p.rating.avg || 0) * c };
    },
    { count: 0, sum: 0 },
  );
  const avgRating = stats?.rating_avg
    ? Number(stats.rating_avg).toFixed(1)
    : catalogReviews.count
      ? (catalogReviews.sum / catalogReviews.count).toFixed(1)
      : null;
  const reviewCount = Number(stats?.reviews_count || catalogReviews.count || 0);
  const testimonials = Array.isArray(stats?.testimonials) ? stats.testimonials : [];

  // Ijtimoiy isbot plitkalari — faqat HAQIQIY raqam bor bo'lganlari.
  // Ma'lumot yo'q bo'lsa plitka umuman chizilmaydi: bo'sh yoki nol raqam
  // ishonchni oshirmaydi, pasaytiradi.
  const socialTiles = [];
  if (stats?.customers > 0) {
    const r = roundedCount(stats.customers);
    socialTiles.push({ key: 'customers', value: `${formatNumber(r.value)}${r.plus ? '+' : ''}`, label: t('landing.social.customers') });
  }
  if (stats?.delivered > 0) {
    const r = roundedCount(stats.delivered);
    socialTiles.push({ key: 'delivered', value: `${formatNumber(r.value)}${r.plus ? '+' : ''}`, label: t('landing.social.delivered') });
  }
  if (avgRating) {
    socialTiles.push({ key: 'rating', value: `${avgRating} / 5`, label: t('landing.social.rating') });
  }
  if (reviewCount > 0) {
    socialTiles.push({ key: 'reviews', value: formatNumber(reviewCount), label: t('landing.social.reviews') });
  }

  // Referal shartlari sozlamalardan keladi — matn aynan hozirgi bonusni
  // aytadi, "bonuslar bor" degan quruq gap emas.
  const refPercent = Number(stats?.referral?.percent || 0);
  const refBonus = Number(stats?.referral?.fixed_bonus || 0);
  const referralText =
    refBonus > 0 && refPercent > 0
      ? t('landing.referral.textBoth', { bonus: formatNumber(refBonus), percent: refPercent })
      : refBonus > 0
        ? t('landing.referral.textFixed', { bonus: formatNumber(refBonus) })
        : refPercent > 0
          ? t('landing.referral.textPercent', { percent: refPercent })
          : t('landing.referral.textPlain');

  // Ko'ringanda fade-in. Bog'liqliklar ro'yxatiga YANGI bo'limlarning
  // uzunliklari ham kiradi: statistika so'rovi katalogdan KEYIN kelsa,
  // sharhlar/narxlar bloklari o'sha paytda paydo bo'ladi — ro'yxat
  // yangilanmasa IntersectionObserver ularga ulanmay qoladi va bo'limlar
  // butunlay ko'rinmas (opacity: 0) bo'lib qolardi.
  useReveal([products.length, allProducts.length, testimonials.length, socialTiles.length]);

  const goToApp = useCallback(() => navigate('/login'), [navigate]);
  const scrollToProducts = useCallback(
    () => pricesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      || productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [],
  );

  return (
    <div className={styles.page}>
      <StructuredData id="ld-org" data={ORG_SCHEMA} />
      <StructuredData id="ld-faq" data={buildFaqSchema(faq)} />
      {/* Sahifa orqa foni — neyron tarmoq rasmi, tema rangidagi parda bilan */}
      <div className={styles.pageBg} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand}>
          <BrandLogo className={styles.brandLogo} title="SANTYX" />
        </div>
        <div className={styles.headerActions}>
          <LangPicker />
          <button type="button" className={styles.loginBtn} onClick={goToApp}>
            {t('landing.nav.login')}
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            {t('landing.hero.titleLine')}
            <br />
            <span className={styles.accent}>{t('landing.hero.titleAccent')}</span>
          </h1>
          <p className={styles.heroText}>{t('landing.hero.text')}</p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.cta} onClick={goToApp}>
              {t('landing.hero.ctaPrimary')}
            </button>
            <button type="button" className={styles.ctaGhost} onClick={scrollToProducts}>
              {t('landing.hero.ctaSecondary')}
            </button>
          </div>
          <ul className={styles.trust}>
            <li>{t('landing.hero.trustGuaranteed')}</li>
            <li>{t('landing.hero.trustFast')}</li>
            <li>{t('landing.hero.trustSupport')}</li>
            {avgRating && (
              <li>{t('landing.hero.trustRating', { avg: avgRating, count: reviewCount })}</li>
            )}
          </ul>
        </div>
      </section>

      {/* Ijtimoiy isbot: hero dan keyin DARHOL, chunki tashrifchi "bu kimlar
          umuman?" degan savolga javobni narxdan oldin izlaydi. Raqamlar
          bazadan (public-stats), pastga yaxlitlangan. */}
      {socialTiles.length > 0 && (
        <section className={styles.socialBand}>
          <h2 className={styles.socialTitle}>{t('landing.social.title')}</h2>
          <div className={styles.socialGrid}>
            {socialTiles.map((tile) => (
              <div className={styles.socialTile} key={tile.key}>
                <strong>{tile.value}</strong>
                <span>{tile.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Qaysi xizmatlar borligi darhol ko'rinsin — tashrifchi qidirib yurmasin */}
      {categories.length > 0 && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.categories.title')}</h2>
          <div className={`${styles.chipRow} ${styles.reveal}`}>
            {categories.map((c) => (
              <span className={styles.chip} key={c.id}>
                {cleanName(c.name)}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section} ref={productsRef}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.popular.title')}</h2>
        <div className={styles.grid}>
          {products.length
            ? products.map((p) => <ProductCard key={p.id} p={p} botUrl={botUrl} t={t} />)
            : !loaded &&
              // Skeletlar — bo'sh joy o'rniga tayyor tuzilma ko'rinadi.
              Array.from({ length: 8 }, (_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
        {loaded && !products.length && (
          <p className={styles.muted}>
            {t('landing.popular.emptyBefore')}
            <a href={botUrl}>{t('landing.popular.emptyLink')}</a>
            {t('landing.popular.emptyAfter')}
          </p>
        )}
      </section>

      {/* To'liq narx ro'yxati. Tashrifchi "qanchadan?" degan savol bilan
          keladi — javobni botga kirmasdan, bitta jadvalda ko'rishi kerak.
          Kartalar faqat 8 ta mashhurini ko'rsatadi, bu esa hammasini. */}
      {allProducts.length > 0 && (
        <section className={styles.section} ref={pricesRef}>
          <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.prices.title')}</h2>
          <div className={`${styles.priceTable} ${styles.reveal}`}>
            <div className={styles.priceHead}>
              <span>{t('landing.prices.colName')}</span>
              <span>{t('landing.prices.colDuration')}</span>
              <span>{t('landing.prices.colPrice')}</span>
            </div>
            {allProducts.map((p) => {
              const bundleItems = Array.isArray(p.bundle_items) ? p.bundle_items : [];
              // To'plam tejamkorligi: tarkibiy narxlar yig'indisi minus
              // to'plam narxi. Faqat haqiqatan tejash bo'lsa ko'rsatiladi.
              const partsTotal = bundleItems.reduce(
                (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
                0,
              );
              const saving = partsTotal > Number(p.price || 0) ? partsTotal - Number(p.price) : 0;
              return (
                <a
                  className={styles.priceRow}
                  key={p.id}
                  href={botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={styles.priceName}>
                    {p.name}
                    {p.is_bundle && <em className={styles.priceTag}>{t('landing.prices.bundleBadge')}</em>}
                    {bundleItems.length > 0 && (
                      <small>
                        {t('landing.prices.bundleIncludes')}{' '}
                        {bundleItems
                          .map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
                          .join(' + ')}
                      </small>
                    )}
                  </span>
                  <span className={styles.priceDuration}>{p.duration || '—'}</span>
                  <span className={styles.priceValue}>
                    <b>{formatPrice(p.price, p.currency || 'UZS')}</b>
                    {p.old_price > p.price && (
                      <s>{formatPrice(p.old_price, p.currency || 'UZS')}</s>
                    )}
                    {saving > 0 && (
                      <em>
                        {t('landing.prices.saveLabel')} {formatPrice(saving, p.currency || 'UZS')}
                      </em>
                    )}
                  </span>
                </a>
              );
            })}
          </div>
          <p className={styles.muted}>{t('landing.prices.note')}</p>
        </section>
      )}

      {/* Mijoz sharhlari — raqamdan keyingi ikkinchi isbot: tirik odamlarning
          gapi. Faqat 4-5 yulduzli va mazmunli (25+ belgi) sharhlar,
          ismlar qisqartirilgan (server tomonida). */}
      {testimonials.length > 0 && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.testimonials.title')}</h2>
          <div className={`${styles.reviewGrid} ${styles.reveal}`}>
            {testimonials.map((item, i) => (
              <figure className={styles.reviewCard} key={`${item.author}-${i}`}>
                <div className={styles.reviewStars} aria-label={`${item.rating} / 5`}>
                  {'★'.repeat(Math.max(1, Math.min(5, item.rating)))}
                  <span>{'★'.repeat(5 - Math.max(1, Math.min(5, item.rating)))}</span>
                </div>
                <blockquote>{item.text}</blockquote>
                <figcaption>
                  {item.author}
                  {item.product ? (
                    <small>
                      {t('landing.testimonials.productPrefix')}
                      {item.product}
                    </small>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.how.title')}</h2>
        <div className={`${styles.steps} ${styles.reveal}`}>
          {steps.map((step, i) => (
            <div className={styles.step} key={step.title}>
              <div className={styles.stepNum}>{i + 1}</div>
              <div>
                <div className={styles.featureTitle}>{step.title}</div>
                <div className={styles.featureText}>{step.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.why.title')}</h2>
        <div className={`${styles.features} ${styles.reveal}`}>
          {advantages.map((item) => (
            <div className={styles.feature} key={item.title}>
              <div className={styles.featureTitle}>{item.title}</div>
              <div className={styles.featureText}>{item.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.perks.title')}</h2>
        <div className={`${styles.features} ${styles.reveal}`}>
          {perks.map((item) => (
            <div className={styles.feature} key={item.title}>
              <div className={styles.featureTitle}>{item.title}</div>
              <div className={styles.featureText}>{item.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Referal — alohida, ko'zga tashlanadigan bo'lim.
          Ilgari referal faqat "Yana nimalar bor" ro'yxatidagi bitta satr edi
          va hech kim ishlatmasdi. Endi: aniq bonus summasi, 3 qadam va
          to'g'ridan-to'g'ri botga o'tuvchi tugma. */}
      <section className={`${styles.referral} ${styles.reveal}`}>
        <h2 className={styles.finalTitle}>{t('landing.referral.title')}</h2>
        <p className={styles.finalText}>{referralText}</p>
        <ol className={styles.referralSteps}>
          {t('landing.referral.steps').map((step, i) => (
            <li key={step}>
              <span>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <a className={styles.cta} href={botUrl} target="_blank" rel="noopener noreferrer">
          {t('landing.referral.cta')}
        </a>
        <p className={styles.referralNote}>{t('landing.referral.note')}</p>
      </section>

      {/* FAQ — native <details>, JS talab qilmaydi */}
      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>{t('landing.faq.title')}</h2>
        <div className={`${styles.faq} ${styles.reveal}`}>
          {faq.map((item) => (
            <details className={styles.faqItem} key={item.q}>
              <summary className={styles.faqQ}>{item.q}</summary>
              <p className={styles.faqA}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.finalCta} ${styles.reveal}`}>
        <h2 className={styles.finalTitle}>{t('landing.finalCta.title')}</h2>
        <p className={styles.finalText}>{t('landing.finalCta.text')}</p>
        <button type="button" className={styles.cta} onClick={goToApp}>
          {t('landing.finalCta.cta')}
        </button>
      </section>

      {/* Lead yig'ish — katalogda topilmagan obunalar uchun so'rov */}
      <section className={`${styles.leadCta} ${styles.reveal}`}>
        <h2 className={styles.finalTitle}>{t('landing.lead.title')}</h2>
        <p className={styles.finalText}>{t('landing.lead.text')}</p>
        <button type="button" className={styles.cta} onClick={() => setLeadOpen(true)}>
          {t('landing.lead.cta')}
        </button>
      </section>

      {leadOpen && <LeadModal onClose={closeLead} />}

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <BrandLogo variant="full" className={styles.footerLogo} title="SANTYX — pro obunalar" />
        </div>
        <div className={styles.footerLinks}>
          <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">
            {t('landing.footer.channel')}
          </a>
          <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
            @{SUPPORT}
          </a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            {t('landing.footer.instagram')}
          </a>
          {/* Bu ikkisi — server tomonda chiziladigan ochiq sahifalar.
              <Link> emas, oddiy <a>: React Router ularni bilmaydi, brauzer
              to'g'ridan-to'g'ri serverdan olishi kerak. */}
          <a href="/obuna">{t('landing.footer.plans')}</a>
          <a href="/qollanma/ozbekistondan-tolash">{t('landing.footer.payGuide')}</a>
          <Link to="/maxfiylik">{t('landing.footer.privacy')}</Link>
          <Link to="/shartlar">{t('landing.footer.terms')}</Link>
        </div>
        <div className={styles.copyright}>{t('landing.footer.copyright')}</div>
      </footer>
    </div>
  );
}
