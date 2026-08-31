import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useCart } from '../lib/CartProvider.jsx';
import { haptic } from '../telegram/webapp.js';
import styles from './GoToCartBar.module.css';

// Savatga biror obuna qo'shilgandan keyin TabBar ustida chiqadigan suzuvchi
// tugma. Savat bo'sh bo'lsa umuman chizilmaydi — ya'ni tugma faqat qo'shilgandan
// keyin ko'rinadi. Balandligini `--gocart-h` ga yozamiz: Layout kontenti shu
// qiymatga qarab pastdan bo'sh joy qoldiradi (cookie bildirishnomasi kabi).
const BAR_HEIGHT = 58;

export default function GoToCartBar() {
  const { t } = useI18n();
  const { count } = useCart();
  const navigate = useNavigate();
  const visible = count > 0;

  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.removeProperty('--gocart-h');
      return undefined;
    }
    root.style.setProperty('--gocart-h', `${BAR_HEIGHT}px`);
    return () => root.style.removeProperty('--gocart-h');
  }, [visible]);

  if (!visible) return null;

  const open = () => {
    haptic.impact('light');
    navigate('/cart');
  };

  return (
    <div className={styles.wrap}>
      <button type="button" className={`${styles.btn} pressable`} onClick={open}>
        <Icon name="cart" size={19} strokeWidth={2} />
        <span>{t('cart.goToCart')}</span>
        <span className={styles.count}>{count}</span>
      </button>
    </div>
  );
}
