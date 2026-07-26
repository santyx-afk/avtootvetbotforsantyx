-- Faza 6: Admin panel uchun yangi ustunlar va jadvallar

-- Foydalanuvchilarni bloklash
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- Rejalar uchun rasmiy narx va qoidalar
ALTER TABLE plans ADD COLUMN IF NOT EXISTS official_price NUMERIC;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS rules_text TEXT;

-- Sharhlar statusini boshqarish
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Settings uchun yangi sozlamalar
ALTER TABLE settings ADD COLUMN IF NOT EXISTS referral_percent NUMERIC DEFAULT 10;

-- Supabase Storage bucket (product-images) qo'lda yaratilishi kerak
-- Admin panelda: Storage > New Bucket > product-images > Public
