-- 2026-09-05 — Sozlamalar: texnik tanaffus rejimi va to'lov kutish vaqti.
-- PR: claude/app-performance-analysis-j7vbo6 (admin panel yangilanishi)
--
-- maintenance_mode — yoqilganda Mini App "texnik ishlar" ekranini ko'rsatadi
--   (adminlar uchun ochiq qoladi); bot va to'lovni aniqlash ishlayveradi.
-- maintenance_text — ekrandagi matn (bo'sh bo'lsa standart).
-- payment_timeout_minutes — Mini App checkout/topup uchun to'lov kutish
--   muddati (ilgari faqat WEBAPP_CHECKOUT_MINUTES env orqali, sukut 10).
--
-- Idempotent — ikki marta ishga tushirilsa buzilmaydi.

alter table settings add column if not exists maintenance_mode boolean not null default false;
alter table settings add column if not exists maintenance_text text;
alter table settings add column if not exists payment_timeout_minutes integer not null default 10;
