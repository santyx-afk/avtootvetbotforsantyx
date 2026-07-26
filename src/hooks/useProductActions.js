import { apiCall } from '../lib/api.js';
import { useCart } from '../lib/CartProvider.jsx';
import { haptic } from '../telegram/webapp.js';

// Wishlist va savat amallari — Catalog va ProductDetail o'rtasida umumiy.
export function useProductActions() {
  const { setCount } = useCart();

  const toggleWishlist = async (productId) => {
    const res = await apiCall('wishlist-toggle', { productId });
    return Boolean(res?.in_wishlist);
  };

  const addToCart = async (productId, quantity = 1) => {
    const res = await apiCall('cart-add', { productId, quantity });
    if (typeof res?.cartCount === 'number') setCount(res.cartCount);
    haptic.notification('success');
    return res;
  };

  return { toggleWishlist, addToCart };
}
