-- ============================================================
-- OLIB TASHLANGAN FUNKSIYALARDAN QOLGAN JADVALLARNI O'CHIRISH
-- ============================================================
-- Chat, ichki buyurtma va reyting tizimlari vakansiyalar modulidan olib
-- tashlangan (xizmat butunlay bepul bo'ldi), lekin ularning jadvallari bazada
-- qolib ketgan. Kodning birorta joyida ishlatilmaydi — tekshirilgan.
--
-- ⚠️ DIQQAT: bu jadvallarda eski foydalanuvchi ma'lumotlari (yozishmalar,
-- buyurtmalar, sharhlar) saqlanib turgan bo'lishi mumkin. Ishga tushirishdan
-- OLDIN Supabase → Database → Backups bo'limidan zaxira nusxa oling yoki
-- kerakli ma'lumotni CSV ga eksport qiling.
--
-- Nima uchun kerak: ishlatilmaydigan, lekin saqlanayotgan shaxsiy ma'lumot —
-- ortiqcha xavf. Ular yo'q bo'lsa, bazani tushunish ham osonlashadi.
--
-- Bu faylni Supabase → SQL Editor da ishga tushiring.
-- ============================================================

-- Avval bog'liq jadvallar (foreign key tartibi muhim)
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS freelance_reviews CASCADE;
DROP TABLE IF EXISTS freelance_reports CASCADE;
DROP TABLE IF EXISTS freelance_orders CASCADE;
DROP TABLE IF EXISTS vacancy_pending_files CASCADE;

-- Eski to'lov tekshiruvi jadvali: uni faqat netlify/functions/api.js
-- to'ldirardi, u esa autentifikatsiyasiz ochiq bo'lgani uchun o'chirildi.
DROP TABLE IF EXISTS checks CASCADE;

-- Tekshirish: quyidagi so'rov bo'sh natija qaytarishi kerak.
--
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('chats','chat_messages','freelance_orders',
--                       'freelance_reviews','freelance_reports',
--                       'vacancy_pending_files','checks');
