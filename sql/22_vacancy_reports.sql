-- ============================================================
-- Vakansiya reportlari — admin qarori va jarima tizimi
-- 18_vacancy_schema.sql ustiga qo'shimcha. Do'kon jadvallariga tegmaydi.
-- ============================================================

-- Admin qarori. `status` faqat ish holatini bildiradi (pending/reviewed/resolved),
-- bu ustun esa NATIJANI saqlaydi — jarima zinapoyasi shunga qarab sanaladi.
-- 'dismissed' asossiz report demak va hisobga olinmaydi.
--   warned | penalty | banned | dismissed
ALTER TABLE freelance_reports ADD COLUMN IF NOT EXISTS resolution TEXT;

-- Kim va qachon hal qildi (audit uchun).
ALTER TABLE freelance_reports ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE freelance_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Jarima zinapoyasi uchun: foydalanuvchiga qarshi tasdiqlangan reportlarni sanash.
CREATE INDEX IF NOT EXISTS idx_freports_reported
  ON freelance_reports(reported_id)
  WHERE resolution IS NOT NULL AND resolution <> 'dismissed';
