import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiCall } from './api.js';
import { getWebApp } from '../telegram/webapp.js';

const CartContext = createContext(null);

// Savatdagi elementlar sonini global saqlaydi (tab bar badge uchun).
export function CartProvider({ children }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!getWebApp()?.initData) return;
    try {
      const res = await apiCall('cart-count');
      setCount(res?.cartCount || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CartContext.Provider value={{ count, setCount, refresh }}>{children}</CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext) || { count: 0, setCount: () => {}, refresh: () => {} };
}
