-- ============================================================
-- E'lonlar uchun haqiqiy arxiv (yumshoq o'chirish)
-- "O'chirish" endi e'lonni arxivga oladi — keyin tiklash mumkin.
-- Butunlay o'chirish alohida amal sifatida qoladi.
-- ============================================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Katalogda va 3 ta faol e'lon limitida arxivdagilar hisobga olinmaydi.
-- 18_vacancy_schema.sql dagi indeksni arxivni istisno qiladigan qilib almashtiramiz.
DROP INDEX IF EXISTS idx_listings_active;
CREATE INDEX IF NOT EXISTS idx_listings_active
  ON listings(category)
  WHERE is_published = true AND is_hidden = false AND is_archived = false;

-- Ishchining arxividagi e'lonlarini tez topish uchun.
CREATE INDEX IF NOT EXISTS idx_listings_archived
  ON listings(worker_id)
  WHERE is_archived = true;
