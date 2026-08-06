-- ============================================================
-- Vakansiya order flow — to'lov bosqichlari va deadline taymeri
-- 18_vacancy_schema.sql ustiga qo'shimcha ustunlar.
-- Mavjud obuna do'koni jadvallariga tegmaydi.
-- ============================================================

-- To'lov bosqichi: unique_price qaysi to'lovga tegishli ekanini bildiradi.
-- 'first'  — 50% oldindan to'lov (10 daqiqalik taymer)
-- 'second' — qolgan 50% (3 kunlik taymer)
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS payment_stage TEXT;

-- Joriy to'lov oynasi tugash vaqti (payment_pending / final_payment_pending uchun).
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;

-- To'lov aniqlangan vaqtlar (HumoCardBot orqali).
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS first_paid_at TIMESTAMPTZ;
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS second_paid_at TIMESTAMPTZ;

-- Deadline o'tganda mijoz "Kutaman" deb qo'shimcha vaqt bergan marta soni.
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS deadline_extended_count INTEGER DEFAULT 0;

-- Bekor qilinganda mijozga qaytarilishi kerak bo'lgan summa (admin qo'lda qaytaradi).
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS refund_amount INTEGER DEFAULT 0;

-- Bekor qilish sababi (deadline, to'lov muddati o'tdi, tomon bekor qildi).
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- HumoCardBot to'lovni unique_price bo'yicha topadi — tez qidiruv uchun index.
CREATE INDEX IF NOT EXISTS idx_forders_unique_price
  ON freelance_orders(unique_price)
  WHERE status IN ('payment_pending', 'final_payment_pending');

-- Deadline tekshiruvi (scheduled function) uchun index.
CREATE INDEX IF NOT EXISTS idx_forders_deadline
  ON freelance_orders(deadline_at)
  WHERE status IN ('in_progress', 'revising');

-- To'lov oynasi muddati tekshiruvi uchun index.
CREATE INDEX IF NOT EXISTS idx_forders_payment_expires
  ON freelance_orders(payment_expires_at)
  WHERE status IN ('payment_pending', 'final_payment_pending');
