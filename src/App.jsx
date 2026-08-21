import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BackButtonManager from './components/BackButtonManager.jsx';
import CookieBanner from './components/CookieBanner.jsx';
import EmptyState from './components/EmptyState.jsx';
import { FullScreenLoader } from './components/Spinner.jsx';
import Landing from './pages/Landing.jsx';
import { useTelegram } from './telegram/TelegramProvider.jsx';

// Landing — santyx.uz ga kirgan odam ko'radigan yagona sahifa, shuning uchun u
// asosiy paketda (darhol chiziladi). Qolgan hamma narsa faqat kerak bo'lganda
// yuklanadi: ilgari tashrifchi butun ilovani (savat, checkout, vakansiya)
// yuklab olardi va birinchi chizish shuncha kutardi.
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Layout = lazy(() => import('./components/Layout.jsx'));
const Onboarding = lazy(() => import('./components/Onboarding.jsx'));
const ContactGate = lazy(() => import('./components/ContactGate.jsx'));
const Catalog = lazy(() => import('./pages/Catalog.jsx'));
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const TopUp = lazy(() => import('./pages/TopUp.jsx'));
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'));
const History = lazy(() => import('./pages/History.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const VacancyLayout = lazy(() => import('./components/VacancyLayout.jsx'));
const VacancyHome = lazy(() => import('./pages/vacancy/VacancyHome.jsx'));
const VacancyListings = lazy(() => import('./pages/vacancy/VacancyListings.jsx'));
const VacancyProfile = lazy(() => import('./pages/vacancy/VacancyProfile.jsx'));
const WebLogin = lazy(() => import('./pages/WebLogin.jsx'));
// Maxfiylik siyosati — kirmagan tashrifchiga ham ochiq bo'lishi shart
// (cookie bildirishnomasidagi havola shu yerga olib keladi).
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
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

  // Brauzer, hali login qilinmagan → Landing / Login / Maxfiylik sahifalari
  if (!authed) {
    return (
      <>
        <Routes>
          <Route
            path="/login"
            element={
              <Suspense fallback={<FullScreenLoader />}>
                <WebLogin onSuccess={() => setAuthed(true)} />
              </Suspense>
            }
          />
          <Route
            path="/maxfiylik"
            element={
              <Suspense fallback={<FullScreenLoader />}>
                <Privacy />
              </Suspense>
            }
          />
          <Route
            path="/shartlar"
            element={
              <Suspense fallback={<FullScreenLoader />}>
                <Terms />
              </Suspense>
            }
          />
          <Route path="/" element={<Landing />} />
          {/* Noma'lum manzil — Landing emas, alohida 404 (noindex bilan).
              Ilgari bu yerda "*" -> Landing turardi va har qanday xato manzil
              200 OK bilan bosh sahifani ko'rsatardi (qidiruv uchun "soft 404"). */}
          <Route
            path="*"
            element={
              <Suspense fallback={<FullScreenLoader />}>
                <NotFound />
              </Suspense>
            }
          />
        </Routes>
        <CookieBanner />
      </>
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
      <Suspense fallback={<FullScreenLoader />}>
        <Onboarding
          onDone={() => {
            setOnboarded();
            setOnboardedState(true);
          }}
        />
      </Suspense>
    );
  }

  // Kontakt (telefon) — Telegram'da ham, brauzerda ham so'raladi (ContactGate ichida moslashadi).
  if (!contactSaved) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <ContactGate onDone={() => setContactSavedState(true)} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <BackButtonManager />
      <CookieBanner />
      <Routes>
        {/* To'liq ekran (tab barsiz) sahifalar */}
        <Route path="/maxfiylik" element={<Privacy />} />
        <Route path="/shartlar" element={<Terms />} />
        <Route path="/catalog/:id" element={<ProductDetail />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/profile/topup" element={<TopUp />} />
        {/* Do'kon (obuna) rejimi — tab barli sahifalar */}
        <Route element={<Layout />}>
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/history" element={<History />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        {/* Vakansiya (super-app) rejimi — bepul e'lonlar doskasi */}
        <Route element={<VacancyLayout />}>
          <Route path="/vacancy" element={<VacancyHome />} />
          <Route path="/vacancy/listings" element={<VacancyListings />} />
          <Route path="/vacancy/profile" element={<VacancyProfile />} />
          {/* Eski chat/order yo'llari — bosh sahifaga qaytariladi */}
          <Route path="/vacancy/*" element={<Navigate to="/vacancy" replace />} />
        </Route>
        <Route path="/" element={<Navigate to="/catalog" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
