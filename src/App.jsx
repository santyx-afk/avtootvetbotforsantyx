import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import BackButtonManager from './components/BackButtonManager.jsx';
import Onboarding from './components/Onboarding.jsx';
import ContactGate from './components/ContactGate.jsx';
import { FullScreenLoader } from './components/Spinner.jsx';
import Catalog from './pages/Catalog.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import TopUp from './pages/TopUp.jsx';
import Wishlist from './pages/Wishlist.jsx';
import History from './pages/History.jsx';
import Profile from './pages/Profile.jsx';
import { useTelegram } from './telegram/TelegramProvider.jsx';
import { apiCall } from './lib/api.js';
import {
  isOnboarded,
  setOnboarded,
  isContactSaved,
  setContactSaved,
} from './utils/storage.js';

export default function App() {
  const { isTelegram } = useTelegram();
  const [booting, setBooting] = useState(() => isTelegram);
  const [onboarded, setOnboardedState] = useState(() => isOnboarded());
  const [contactSaved, setContactSavedState] = useState(() => isContactSaved());

  // Ilova ochilishida foydalanuvchini backend'da ro'yxatga olamiz (init).
  // Agar telefon allaqachon saqlangan bo'lsa — kontakt so'ramaymiz.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => active && setBooting(false), 6000);
    (async () => {
      if (isTelegram) {
        try {
          const res = await apiCall('init');
          if (active && res?.hasPhone) {
            setContactSaved(true);
            setContactSavedState(true);
          }
        } catch {
          /* backend tayyor bo'lmasa — gate baribir urinib ko'radi */
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
  }, [isTelegram]);

  if (booting) return <FullScreenLoader />;

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

  if (isTelegram && !contactSaved) {
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
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="/" element={<Navigate to="/catalog" replace />} />
        <Route path="*" element={<Navigate to="/catalog" replace />} />
      </Routes>
    </>
  );
}
