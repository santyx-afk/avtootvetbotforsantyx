-- ============================================================
-- Vakansiya to'lov muddati — ogohlantirish tizimi
-- Order bekor qilinishidan oldin mijozga xabar yuboriladi.
-- Do'kon jadvallariga tegmaydi.
-- ============================================================

-- Muddat tugashidan oldin ogohlantirish yuborilganini belgilaydi.
-- Har yangi to'lov oynasi ochilganda false ga qaytariladi.
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS payment_warning_sent BOOLEAN DEFAULT false;

-- Ogohlantirish yuboriladigan orderlarni tez topish uchun.
CREATE INDEX IF NOT EXISTS idx_forders_payment_warning
  ON freelance_orders(payment_expires_at)
  WHERE status IN ('payment_pending', 'final_payment_pending')
    AND payment_warning_sent = false;
