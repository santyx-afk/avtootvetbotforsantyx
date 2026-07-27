-- Faza 7 bug tuzatish: banner qo'shimcha maydonlari
-- Admin forma subtitle/btn_text/gradient yuboradi, lekin bu ustunlar yo'q edi —
-- shuning uchun banner saqlash ishlamayotgan edi. Endi qo'shamiz.
ALTER TABLE banners ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS btn_text TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS gradient TEXT;

-- Rasm ixtiyoriy bo'lsin (gradient-only banner uchun)
ALTER TABLE banners ALTER COLUMN image_url DROP NOT NULL;
