-- ============================================================
-- BARCHA JADVALLARDA RLS (Row Level Security) NI YOQISH
-- ============================================================
-- Nima uchun kerak:
--   Loyihaning butun ma'lumot oqimi Netlify funksiyalari orqali, `service_role`
--   kaliti bilan boradi. Service role RLS ni chetlab o'tadi, shuning uchun bu
--   migratsiya mavjud kodni BUZMAYDI.
--   Ammo Supabase loyihasida `anon` (ochiq) kalit ham bor. RLS o'chiq bo'lganda
--   o'sha kalitni qo'lga kiritgan har kim butun bazani o'qiy va o'zgartira oladi.
--   RLS yoqilgach — hech qanday siyosat (policy) yozilmagani uchun — anon kalit
--   uchun hamma narsa yopiladi. Bu ataylab: hozir brauzerdan to'g'ridan-to'g'ri
--   bazaga murojaat qilinmaydi.
--
-- Keyinchalik brauzerdan to'g'ridan-to'g'ri o'qish kerak bo'lsa, o'sha jadvalga
-- aniq CREATE POLICY yozish kerak bo'ladi.
--
-- Bu faylni Supabase → SQL Editor da bir marta ishga tushiring.
-- Qayta ishga tushirish xavfsiz (idempotent).
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE ataylab QO'YILMAGAN: u jadval egasini ham siyosatlarga bo'ysundiradi
    -- va SECURITY DEFINER funksiyalarni (masalan hamyonni to'ldirish) buzishi
    -- mumkin. Oddiy ENABLE anon kalitni to'sish uchun yetarli — service_role
    -- BYPASSRLS huquqiga ega, shuning uchun ilova o'zgarishsiz ishlaydi.
  END LOOP;
END $$;

-- Tekshirish: quyidagi so'rov RLS yoqilmagan jadvallarni ko'rsatadi.
-- Natija bo'sh bo'lsa — hammasi joyida.
--
--   SELECT tablename FROM pg_tables t
--   JOIN pg_class c ON c.relname = t.tablename
--   WHERE t.schemaname = 'public' AND c.relrowsecurity = false;
