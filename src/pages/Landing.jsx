import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCall } from '../lib/api.js';
import { getTheme, toggleTheme } from '../lib/theme.js';
import { formatPrice } from '../utils/format.js';
import styles from './Landing.module.css';

const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');
const SUPPORT = (import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace(/^@/, '');
const BOT_URL = `https://t.me/${BOT}`;
const CHANNEL_URL = 'https://t.me/santyx_pro';
const INSTAGRAM_URL = 'https://instagram.com/santyx.uz';

// Katalog sessiyaga keshlanadi — sahifaga qayta kirilganda ro'yxat
// so'rov kutmasdan darhol chiziladi.
const CACHE_KEY = 'santyx:landing:catalog';

const ADVANTAGES = [
  { title: 'To‘liq kafolat', text: 'Har bir obuna kafolatlanadi — muammo bo‘lsa almashtiramiz.' },
  { title: 'Tezkor yetkazish', text: 'To‘lovdan so‘ng 10–15 daqiqada obunangiz tayyor.' },
  { title: 'Hamyonbop narxlar', text: 'Rasmiy narxdan sezilarli past — sifatdan yon bermaymiz.' },
  { title: '12/7 qo‘llab-quvvatlash', text: 'Har kuni, kun davomida savollaringizga javob beramiz.' },
];

const STEPS = [
  { n: '1', title: 'Obunani tanlang', text: 'Katalogdan kerakli xizmatni toping.' },
  { n: '2', title: 'To‘lovni amalga oshiring', text: 'Karta orqali — to‘lov avtomatik aniqlanadi.' },
  { n: '3', title: 'Foydalanishni boshlang', text: 'Kirish ma’lumotlari bir necha daqiqada keladi.' },
];

// Ilovada mavjud bo'lgan haqiqiy imkoniyatlar.
const PERKS = [
  { title: 'Balans', text: 'Hisobingizni oldindan to‘ldiring va xaridni bir bosishda yakunlang.' },
  { title: 'Referal dasturi', text: 'Do‘stlaringizni taklif qiling — har bir xaridlari uchun bonus.' },
  { title: 'Promokodlar', text: 'Chegirma va keshbek olib, keyingi xaridda ishlating.' },
  { title: 'Obuna nazorati', text: 'Faol obunalaringiz va tugash muddati profilda ko‘rinadi.' },
];

const FAQ = [
  {
    q: 'Obuna qanchada yetkaziladi?',
    a: 'To‘lov tizim tomonidan aniqlangach, odatda 10–15 daqiqa ichida. Kirish ma’lumotlari Telegram orqali yuboriladi.',
  },
  {
    q: 'To‘lovni qanday amalga oshiraman?',
    a: 'Buyurtma rasmiylashtirilgach sizga karta raqami va aniq summa ko‘rsatiladi. Shu summani o‘tkazasiz — to‘lov avtomatik aniqlanadi, chek yuborish shart emas.',
  },
  {
    q: 'Nega summa butun son emas?',
    a: 'Har bir buyurtmaga noyob summa beriladi — tizim to‘lovni aynan shu orqali taniydi. Shuning uchun ko‘rsatilgan summani o‘zgartirmasdan o‘tkazish muhim.',
  },
  {
    q: 'Muammo chiqsa nima bo‘ladi?',
    a: 'Har bir obuna kafolatlanadi. Ishlamasa yoki kafolat muddatidan oldin to‘xtasa — almashtiramiz yoki mablag‘ni qaytaramiz.',
  },
  {
    q: 'Obunani uzaytirsam bo‘ladimi?',
    a: 'Ha. Muddat tugashiga yaqin sizga eslatma keladi, profilda esa faol obunalaringiz ro‘yxati turadi.',
  },
  {
    q: 'Bu rasmiy obunami?',
    a: 'Ha, xizmatlar rasmiy obunalar asosida beriladi. Farqi — narx: biz uni sezilarli hamyonbop qilamiz.',
  },
  {
    q: 'Vakansiya e‘lonini qanday joylayman?',
    a: 'Botni oching, “Vakansiya qidirish/joylash” tugmasini bosing, ro‘yxatdan o‘ting va e‘loningizni yarating — butunlay tekin.',
  },
];

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

export default function Landing() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(getTheme);
  // Keshdan boshlaymiz — birinchi chizishda bo'sh joy ko'rinmaydi.
  const [data, setData] = useState(() => readCache() || { products: [], categories: [] });
  const [loaded, setLoaded] = useState(() => Boolean(readCache()));
  const productsRef = useRef(null);

  const { products, categories } = data;
  useReveal([products.length]);

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

  const onToggleTheme = useCallback(() => setTheme(toggleTheme()), []);
  const goToApp = useCallback(() => navigate('/login'), [navigate]);
  const scrollToProducts = useCallback(
    () => productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    [],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandName}>
            SANTYX <b>PRO</b>
          </span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.themeBtn}
            onClick={onToggleTheme}
            aria-label="Mavzuni almashtirish"
          >
            {theme === 'dark' ? 'Yorug‘' : 'Tungi'}
          </button>
          <button type="button" className={styles.loginBtn} onClick={goToApp}>
            Kirish
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            Premium obunalar —<br />
            <span className={styles.accent}>hamyonbop narxlarda</span>
          </h1>
          <p className={styles.heroText}>
            CapCut, Canva, Adobe, Gemini AI va boshqa professional xizmatlar. Rasmiy obuna, to‘liq
            kafolat, 10–15 daqiqada yetkazib beriladi.
          </p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.cta} onClick={goToApp}>
              Obunalarni ko‘rish
            </button>
            <button type="button" className={styles.ctaGhost} onClick={scrollToProducts}>
              Narxlar
            </button>
          </div>
          <ul className={styles.trust}>
            <li>Kafolatlangan</li>
            <li>10–15 daqiqa</li>
            <li>12/7 yordam</li>
            {avgRating && (
              <li>
                {avgRating} / 5 — {reviewStats.count} ta sharh
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* Qaysi xizmatlar borligi darhol ko'rinsin — tashrifchi qidirib yurmasin */}
      {categories.length > 0 && (
        <section className={styles.section}>
          <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Qanday obunalar bor</h2>
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
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Mashhur obunalar</h2>
        <div className={styles.grid}>
          {products.length
            ? products.map((p) => <ProductCard key={p.id} p={p} />)
            : !loaded &&
              // Skeletlar — bo'sh joy o'rniga tayyor tuzilma ko'rinadi.
              Array.from({ length: 8 }, (_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
        {loaded && !products.length && (
          <p className={styles.muted}>
            Obunalar ro‘yxatini <a href={BOT_URL}>botda</a> ko‘rishingiz mumkin.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Qanday ishlaydi</h2>
        <div className={`${styles.steps} ${styles.reveal}`}>
          {STEPS.map((s) => (
            <div className={styles.step} key={s.n}>
              <div className={styles.stepNum}>{s.n}</div>
              <div>
                <div className={styles.featureTitle}>{s.title}</div>
                <div className={styles.featureText}>{s.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Nega biz?</h2>
        <div className={`${styles.features} ${styles.reveal}`}>
          {ADVANTAGES.map((a) => (
            <div className={styles.feature} key={a.title}>
              <div className={styles.featureTitle}>{a.title}</div>
              <div className={styles.featureText}>{a.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Yana nimalar bor</h2>
        <div className={`${styles.features} ${styles.reveal}`}>
          {PERKS.map((p) => (
            <div className={styles.feature} key={p.title}>
              <div className={styles.featureTitle}>{p.title}</div>
              <div className={styles.featureText}>{p.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.reveal}`}>
        <h2 className={styles.sectionTitle}>Vakansiya e&apos;lonlari</h2>
        <p className={styles.heroText}>
          Endi bot ichida ishchi qidirish yoki o&apos;z xizmatingizni taklif qilish uchun e&apos;lon
          joylash mumkin — butunlay tekin. Ro&apos;yxatdan o&apos;ting va e&apos;loningizni bir necha
          daqiqada chop eting.
        </p>
        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.cta}
            onClick={() => window.open(BOT_URL, '_blank', 'noopener')}
          >
            Vakansiyalarni ko&apos;rish
          </button>
        </div>
      </section>

      {/* FAQ — native <details>, JS talab qilmaydi */}
      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Ko&apos;p so&apos;raladigan savollar</h2>
        <div className={`${styles.faq} ${styles.reveal}`}>
          {FAQ.map((item) => (
            <details className={styles.faqItem} key={item.q}>
              <summary className={styles.faqQ}>{item.q}</summary>
              <p className={styles.faqA}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.finalCta} ${styles.reveal}`}>
        <h2 className={styles.finalTitle}>Bugun boshlang</h2>
        <p className={styles.finalText}>Obunani tanlang — bir necha daqiqada tayyor bo‘ladi.</p>
        <button type="button" className={styles.cta} onClick={goToApp}>
          Katalogga o‘tish
        </button>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">
            Telegram kanal
          </a>
          <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
            @{SUPPORT}
          </a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
          <Link to="/maxfiylik">Maxfiylik siyosati</Link>
        </div>
        <div className={styles.copyright}>© 2026 Santyx Pro</div>
      </footer>
    </div>
  );
}
