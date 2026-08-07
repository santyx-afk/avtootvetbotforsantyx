-- ============================================================
-- Vakansiya baholari — reyting hisob-kitobi
-- 18_vacancy_schema.sql ustiga qo'shimcha. Mavjud do'kon jadvallariga tegmaydi.
-- ============================================================

-- Deadline jarimasi (har buzilishda +0.5) alohida saqlanadi.
-- Sababi: avg_rating endi baholardan qayta hisoblanadi, jarima esa
-- to'g'ridan-to'g'ri avg_rating ga yozilsa, keyingi baho kelganda yuvilib ketardi.
-- Yakuniy reyting = baholar o'rtachasi - rating_penalty (0 dan past emas).
ALTER TABLE workers ADD COLUMN IF NOT EXISTS rating_penalty NUMERIC(3,2) DEFAULT 0;

-- Reyting hisoblash uchun: kimga qo'yilgan baholarni tez topish.
CREATE INDEX IF NOT EXISTS idx_freviews_target
  ON freelance_reviews(reviewed_id, reviewer_role)
  WHERE is_visible = true;

-- Bir order bo'yicha har tomon bitta baho qoldiradi — bu cheklov
-- 18_vacancy_schema.sql da UNIQUE(order_id, reviewer_role) sifatida mavjud.
