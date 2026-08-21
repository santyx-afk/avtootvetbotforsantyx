import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCall } from '../lib/api.js';
import { formatPrice } from '../utils/format.js';
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

function ProductCard({ p }) {
  const discount =
    p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return (
    <a className={styles.card} href={BOT_URL} target="_blank" rel="noopener noreferrer">
      <div className={styles.cardImg}>
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" width="160" height="160" />
        ) : (
          <span className={styles.cardImgFallback} aria-hidden="true" />
        )}
        {discount > 0 && <span className={styles.badge}>-{discount}%</span>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{p.name}</div>
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
  const [data, setData] = useState(() => readCache() || { products: [], categories: [] });
  const [loaded, setLoaded] = useState(() => Boolean(readCache()));
  const [leadOpen, setLeadOpen] = useState(false);
  const productsRef = useRef(null);

  const { products, categories } = data;
  useReveal([products.length]);

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
        const next = {
          products: (res.products || [])
            .slice()
            .sort((a, b) => Number(b.is_popular) - Number(a.is_popular))
            .slice(0, 8),
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
    return () => {
      active = false;
    };
  }, []);

  // Sharhlar bo'yicha umumiy ko'rsatkich — mavjud ma'lumotdan hisoblanadi.
  const reviewStats = products.reduce(
    (acc, p) => {
      const c = Number(p.rating?.count || 0);
      if (!c) return acc;
      return { count: acc.count + c, sum: acc.sum + Number(p.rating.avg || 0) * c };
    },
    { count: 0, sum: 0 },
  );
  const avgRating = reviewStats.count ? (reviewStats.sum / reviewStats.count).toFixed(1) : null;

  const goToApp = useCallback(() => navigate('/login'), [navigate]);
  const scrollToProducts = useCallback(
    () => productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
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
              <li>{t('landing.hero.trustRating', { avg: avgRating, count: reviewStats.count })}</li>
            )}
          </ul>
        </div>
      </section>

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
            ? products.map((p) => <ProductCard key={p.id} p={p} />)
            : !loaded &&
              // Skeletlar — bo'sh joy o'rniga tayyor tuzilma ko'rinadi.
              Array.from({ length: 8 }, (_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
        {loaded && !products.length && (
          <p className={styles.muted}>
            {t('landing.popular.emptyBefore')}
            <a href={BOT_URL}>{t('landing.popular.emptyLink')}</a>
            {t('landing.popular.emptyAfter')}
          </p>
        )}
      </section>

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

      <section className={`${styles.section} ${styles.reveal}`}>
        <h2 className={styles.sectionTitle}>{t('landing.vacancy.title')}</h2>
        <p className={styles.heroText}>{t('landing.vacancy.text')}</p>
        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.cta}
            onClick={() => window.open(BOT_URL, '_blank', 'noopener')}
          >
            {t('landing.vacancy.cta')}
          </button>
        </div>
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
          <Link to="/maxfiylik">{t('landing.footer.privacy')}</Link>
          <Link to="/shartlar">{t('landing.footer.terms')}</Link>
        </div>
        <div className={styles.copyright}>{t('landing.footer.copyright')}</div>
      </footer>
    </div>
  );
}
