import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { showBackButton, hideBackButton } from '../telegram/webapp.js';

// Ildiz (tab) yo'nalishlari — bularda Telegram back button yashiriladi.
const ROOT_PATHS = ['/catalog', '/cart', '/wishlist', '/history', '/profile', '/'];

// Joriy yo'nalishga qarab Telegram BackButton'ni ko'rsatadi/yashiradi.
// Ildiz bo'lmagan sahifalarda bosilganda oldingi sahifaga qaytaradi.
export default function BackButtonManager() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const isRoot = ROOT_PATHS.includes(location.pathname);
    if (isRoot) {
      hideBackButton();
    } else {
      showBackButton(() => navigate(-1));
    }
    return () => hideBackButton();
  }, [location.pathname, navigate]);

  return null;
}
