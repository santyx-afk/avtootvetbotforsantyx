import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { TelegramProvider } from './telegram/TelegramProvider.jsx';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { CartProvider } from './lib/CartProvider.jsx';
import { initTheme } from './lib/theme.js';
import './styles/global.css';

// Brauzer temasini (saqlangan yoki tizim) darhol qo'llaymiz.
// Telegram ichida applyThemeVars data-tg-theme o'rnatadi va bu e'tiborsiz qoladi.
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <TelegramProvider>
        <I18nProvider>
          <CartProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </CartProvider>
        </I18nProvider>
      </TelegramProvider>
    </ErrorBoundary>
  </StrictMode>,
);
