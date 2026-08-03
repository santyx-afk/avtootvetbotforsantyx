-- FIX 2: Promokodga uchinchi tur — cashback_percent.
-- Mavjud 'percent' va 'fixed' saqlanadi (eski promokodlar buzilmaydi).

ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_discount_type_check;
ALTER TABLE promo_codes
  ADD CONSTRAINT promo_codes_discount_type_check
  CHECK (discount_type IN ('percent', 'fixed', 'cashback_percent'));

-- Cashback promokod ishlatilganda: to'lov to'liq narxda, lekin to'lov
-- tasdiqlangach shu summa balansga qaytadi (checkout paytida hisoblab yoziladi).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_amount NUMERIC NOT NULL DEFAULT 0;
