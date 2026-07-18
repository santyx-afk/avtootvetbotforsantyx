-- orders jadvalini HUMO avto-tasdiqlash uchun yangilash
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS check_code TEXT,
ADD COLUMN IF NOT EXISTS expected_amount NUMERIC,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- check_code bo'yicha tez qidirish uchun indeks yaratamiz
CREATE INDEX IF NOT EXISTS idx_orders_check_code ON orders(check_code);
