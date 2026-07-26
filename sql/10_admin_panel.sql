-- Faza 6: Admin panel uchun yangi ustunlar va jadvallar

-- Foydalanuvchilarni bloklash
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- Rejalar uchun rasmiy narx va qoidalar
ALTER TABLE plans ADD COLUMN IF NOT EXISTS official_price NUMERIC;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS rules_text TEXT;

-- Sharhlar statusini boshqarish (default 'approved' — sharh darhol ko'rinadi,
-- admin kerak bo'lsa reject/delete qiladi; mavjud sharhlar buzilmaydi)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- Settings uchun yangi sozlamalar
ALTER TABLE settings ADD COLUMN IF NOT EXISTS referral_percent NUMERIC DEFAULT 10;

-- Referral jadvalga yangi ustunlar
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS first_order_id UUID;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS total_earned NUMERIC DEFAULT 0;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS purchase_count INT DEFAULT 0;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Supabase Storage bucket (product-images) qo'lda yaratilishi kerak
-- Admin panelda: Storage > New Bucket > product-images > Public
