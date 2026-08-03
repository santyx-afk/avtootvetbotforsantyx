import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiCall } from '../lib/api.js';
import { getTheme, toggleTheme } from '../lib/theme.js';
import { formatPrice } from '../utils/format.js';
import styles from './Landing.module.css';

const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');
const SUPPORT = (import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace(/^@/, '');
const BOT_URL = `https://t.me/${BOT}`;
const CHANNEL_URL = 'https://t.me/santyx_pro';
const INSTAGRAM_URL = 'https://instagram.com/santyx.uz';

const ADVANTAGES = [
  { icon: '🛡️', title: 'To‘liq kafolat', text: 'Har bir obuna kafolatlanadi — muammo bo‘lsa almashtiramiz.' },
  { icon: '⚡', title: 'Tezkor yetkazish', text: 'To‘lovdan so‘ng 10–15 daqiqada obunangiz tayyor.' },
  { icon: '💰', title: 'Arzon narxlar', text: 'Rasmiy narxdan ancha arzon — sifatdan yon bermaymiz.' },
  { icon: '🎧', title: '24/7 qo‘llab-quvvatlash', text: 'Savollaringizga istalgan vaqt javob beramiz.' },
];

// IntersectionObserver bilan elementlar ko'ringanda fade-in qiladi.
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(`.${styles.reveal}`);
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add(styles.visible));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

function ProductCard({ p }) {
  const discount =
    p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return (
    <a className={styles.card} href={BOT_URL} target="_blank" rel="noopener noreferrer">
      <div className={styles.cardImg}>
        {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" /> : <span>📦</span>}
        {discount > 0 && <span className={styles.badge}>-{discount}%</span>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{p.name}</div>
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
  const [theme, setTheme] = useState(() => getTheme());
  const [products, setProducts] = useState([]);
  const productsRef = useRef(null);
  useReveal();

  useEffect(() => {
    let active = true;
    apiCall('public-catalog')
      .then((res) => {
        if (!active) return;
        const list = (res.products || [])
          .slice()
          .sort((a, b) => Number(b.is_popular) - Number(a.is_popular))
          .slice(0, 12);
        setProducts(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const onToggleTheme = () => setTheme(toggleTheme());
  const scrollToProducts = () =>
    productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>S</span>
          <span className={styles.brandName}>
            SANTYX <b>PRO</b>
          </span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.themeBtn}
            onClick={onToggleTheme}
            aria-label="Tema"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button type="button" className={styles.loginBtn} onClick={() => navigate('/login')}>
            Kirish
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={`${styles.heroInner} ${styles.reveal}`}>
          <h1 className={styles.heroTitle}>
            Premium obunalar —<br />
            <span className={styles.accent}>arzon narxlarda</span>
          </h1>
          <p className={styles.heroText}>
            Adobe, CapCut, Gemini AI va boshqa professional dasturlar uchun sifatli obunalar.
          </p>
          <button type="button" className={styles.cta} onClick={() => navigate('/login')}>
            Obunalarni ko‘rish
          </button>
        </div>
      </section>

      <section className={styles.section} ref={productsRef}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Mashhur obunalar</h2>
        {products.length ? (
          <div className={`${styles.grid} ${styles.reveal}`}>
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <p className={styles.muted}>Obunalar yuklanmoqda…</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={`${styles.sectionTitle} ${styles.reveal}`}>Nega biz?</h2>
        <div className={`${styles.features} ${styles.reveal}`}>
          {ADVANTAGES.map((a) => (
            <div className={styles.feature} key={a.title}>
              <div className={styles.featureIcon}>{a.icon}</div>
              <div className={styles.featureTitle}>{a.title}</div>
              <div className={styles.featureText}>{a.text}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">
            ✈️ Telegram kanal
          </a>
          <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
            💬 @{SUPPORT}
          </a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
            📷 Instagram
          </a>
        </div>
        <div className={styles.copyright}>© 2026 Santyx Pro</div>
      </footer>
    </div>
  );
}
