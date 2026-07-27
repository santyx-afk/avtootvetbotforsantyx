-- Faza 6 (davomi): Promokodlar uchun minimal buyurtma summasi.
-- promo_codes jadvali schema.sql da yaratilgan (code, discount_type, discount_value,
-- is_one_time, max_uses, used_count, expires_at, is_active). Bu yerda faqat yangi ustun.

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC NOT NULL DEFAULT 0;
