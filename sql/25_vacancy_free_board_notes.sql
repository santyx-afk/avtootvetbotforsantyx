-- ============================================================
-- Vakansiya moduli bepul e'lonlar doskasiga aylantirildi.
-- Chat, order va to'lov tizimi olib tashlandi.
--
-- BU FAYL HECH NARSANI O'ZGARTIRMAYDI — faqat hujjat.
-- Quyidagi jadvallar endi kod tomonidan ishlatilmaydi, lekin ma'lumot
-- yo'qolmasligi uchun ATAYLAB o'chirilmadi.
-- ============================================================

-- Ishlatilmayotgan jadvallar:
--   chats
--   chat_messages
--   freelance_orders
--   freelance_reviews
--   freelance_reports
--   vacancy_pending_files
--
-- Ishlatilayotgan jadvallar (o'zgarishsiz):
--   workers
--   worker_verification
--   listings

-- Ishlatilmayotgan storage bucket: 'vacancy-media'
-- (chat media va natija fayllari uchun edi).

-- ------------------------------------------------------------
-- AGAR ma'lumot kerak bo'lmasa va tozalashni xohlasangiz —
-- quyidagilarni QO'LDA, izohni olib tashlab bajaring.
-- DIQQAT: bu qaytarib bo'lmaydigan amal. Avval zaxira nusxa oling.
-- ------------------------------------------------------------

-- DROP TABLE IF EXISTS vacancy_pending_files;
-- DROP TABLE IF EXISTS freelance_reviews;
-- DROP TABLE IF EXISTS freelance_reports;
-- DROP TABLE IF EXISTS freelance_orders;
-- DROP TABLE IF EXISTS chat_messages;
-- DROP TABLE IF EXISTS chats;
-- DELETE FROM storage.objects WHERE bucket_id = 'vacancy-media';
-- DELETE FROM storage.buckets WHERE id = 'vacancy-media';

-- workers jadvalidagi ishlatilmayotgan ustunlar (o'chirilmaydi, 0 bo'lib qoladi):
--   avg_rating, total_reviews, completed_orders, total_earnings,
--   deadline_violations, rating_penalty, card_number
