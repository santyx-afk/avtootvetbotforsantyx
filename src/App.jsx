import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import BackButtonManager from './components/BackButtonManager.jsx';
import Onboarding from './components/Onboarding.jsx';
import ContactGate from './components/ContactGate.jsx';
import EmptyState from './components/EmptyState.jsx';
import { FullScreenLoader } from './components/Spinner.jsx';
import Catalog from './pages/Catalog.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import TopUp from './pages/TopUp.jsx';
import Wishlist from './pages/Wishlist.jsx';
import History from './pages/History.jsx';
import Profile from './pages/Profile.jsx';
import Vacancies from './pages/Vacancies.jsx'; // vaqtinchalik bo'lim
import Landing from './pages/Landing.jsx';
import WebLogin from './pages/WebLogin.jsx';
import { useTelegram } from './telegram/TelegramProvider.jsx';
import { useI18n } from './i18n/I18nProvider.jsx';
import { apiCall, getToken, clearToken } from './lib/api.js';
import {
  isOnboarded,
  setOnboarded,
  isContactSaved,
  setContactSaved,
} from './utils/storage.js';

const SUPPORT = `@${(import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace(/^@/, '')}`;

export default function App() {
  const { isTelegram } = useTelegram();
  const { t } = useI18n();

  // Ilova (to'liq funksiya) faqat Telegram Mini App'da YOKI brauzerda JWT bo'lsa ishlaydi.
  const [authed, setAuthed] = useState(() => isTelegram || Boolean(getToken()));
  const [booting, setBooting] = useState(() => isTelegram || Boolean(getToken()));
  const [blocked, setBlocked] = useState(false);
  const [onboarded, setOnboardedState] = useState(() => isOnboarded());
  const [contactSaved, setContactSavedState] = useState(() => isContactSaved());

  useEffect(() => {
    if (!authed) {
      setBooting(false);
      return undefined;
    }
    let active = true;
    setBooting(true);
    const timer = setTimeout(() => active && setBooting(false), 6000);
    (async () => {
      try {
        const res = await apiCall('init');
        if (active && res?.hasPhone) {
          setContactSaved(true);
          setContactSavedState(true);
        }
      } catch (err) {
        if (active && (err?.status === 403 || err?.message === 'blocked')) {
          setBlocked(true);
        } else if (active && err?.status === 401 && !isTelegram) {
          // JWT yaroqsiz — login sahifasiga qaytamiz
          clearToken();
          setAuthed(false);
        }
      }
      if (active) {
        clearTimeout(timer);
        setBooting(false);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [authed, isTelegram]);

  // Brauzer, hali login qilinmagan → Landing / Login sahifalari
  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<WebLogin onSuccess={() => setAuthed(true)} />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    );
  }

  if (booting) return <FullScreenLoader />;

  if (blocked) {
    return (
      <div className="app-container" style={{ paddingTop: 80 }}>
        <EmptyState
          emoji="🚫"
          title={t('blocked.title')}
          hint={t('blocked.text', { support: SUPPORT })}
        />
      </div>
    );
  }

  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          setOnboarded();
          setOnboardedState(true);
        }}
      />
    );
  }

  // Kontakt (telefon) — Telegram'da ham, brauzerda ham so'raladi (ContactGate ichida moslashadi).
  if (!contactSaved) {
    return <ContactGate onDone={() => setContactSavedState(true)} />;
  }

  return (
    <>
      <BackButtonManager />
      <Routes>
        {/* To'liq ekran (tab barsiz) sahifalar */}
        <Route path="/catalog/:id" element={<ProductDetail />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/profile/topup" element={<TopUp />} />
        {/* Tab barli sahifalar */}
        <Route element={<Layout />}>
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/history" element={<History />} />
          <Route path="/vacancies" element={<Vacancies />} /> {/* vaqtinchalik bo'lim */}
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="/" element={<Navigate to="/catalog" replace />} />
        <Route path="*" element={<Navigate to="/catalog" replace />} />
      </Routes>
    </>
  );
}
