-- 2026-08-24 · Vakansiyalar bo'limi jadvallarini o'chirish
-- PR #54 ga qo'shimcha.
--
-- Vakansiyalar (bepul ishchi/e'lon taxtasi) bo'limi butunlay olib tashlandi:
-- sayt sahifalari, admin bo'limi, Netlify funksiyalari va botdagi tugma
-- koddan chiqarildi. Bazadagi jadvallar esa qoldi.
--
-- ⚠️ DIQQAT — BU FAYLNI MEN ISHGA TUSHIRMADIM.
-- Jadvallarda haqiqiy foydalanuvchi ma'lumotlari bor (2026-08-24 holatiga):
--     workers              — 13 qator (ishchi profillari, telefon, portfolio)
--     worker_verification  — 13 qator (tasdiqlash hujjatlari)
--     listings             —  2 qator (e'lonlar)
-- O'chirishni ORQAGA QAYTARIB BO'LMAYDI. Ishga tushirishdan oldin zaxira oling:
--     Table Editor → jadvalni tanlang → ⋯ → Export as CSV
-- yoki to'liq dump:
--     pg_dump "<URI>" --schema=public --no-owner -Fc -f santyx-backup.dump
--
-- Zaxira olgach, bu faylni Supabase → SQL Editor da ishga tushiring.

-- Bog'liqlik tartibi muhim emas: CASCADE tashqi kalitlarni ham olib tashlaydi.
drop table if exists public.listings cascade;
drop table if exists public.worker_verification cascade;
drop table if exists public.workers cascade;

-- Tekshirish: quyidagi so'rov bo'sh natija qaytarishi kerak.
--
--   SELECT tablename FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN ('workers', 'worker_verification', 'listings');
--
-- Eslatma: vakansiya fayllari uchun Storage bucket ham bo'lishi mumkin
-- (sql/19_vacancy_storage.sql ga qarang). Uni Supabase → Storage bo'limidan
-- qo'lda o'chirasiz — SQL orqali emas.
