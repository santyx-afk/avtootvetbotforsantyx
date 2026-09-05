-- 2026-09-05 — Foydalanuvchi kartochkasi: admin izohi va teglar.
-- PR: claude/app-performance-analysis-j7vbo6 (admin panel yangilanishi)
--
-- Nima uchun: admin mijoz haqida eslatma ("VIP", "shubhali", "optom oladi")
-- qoldira olishi va ro'yxatda teg bo'yicha ajrata olishi uchun. Faqat admin
-- panel o'qiydi/yozadi, Mini App'ga chiqmaydi.
--
-- Idempotent — ikki marta ishga tushirilsa buzilmaydi.

alter table users add column if not exists admin_note text;
alter table users add column if not exists tags text[] not null default '{}';
