-- ============================================================
-- OCHIQ (anon) ROLDAN RPC VA VIEW HUQUQLARINI OLIB TASHLASH
-- ============================================================
-- ⚠️ Bu eng jiddiy topilma edi. RLS ni yoqishning o'zi yetarli emas.
--
-- Supabase PostgREST barcha `public` sxemadagi funksiyalarni avtomatik
-- `/rest/v1/rpc/<nom>` manzilida chop etadi. Bu loyihada 7 ta funksiya
-- `anon` roli uchun ochiq edi, ya'ni anon kalitni bilgan har kim ularni
-- to'g'ridan-to'g'ri chaqira olardi:
--
--   credit_user_wallet            — istalgan hisobga istalgan summa qo'shish.
--                                   Bu funksiya SECURITY DEFINER, ya'ni RLS ni
--                                   ham chetlab o'tadi — RLS yoqilgan bo'lsa ham
--                                   ochiq qolardi.
--   confirm_payment_notification  — to'lovni "tasdiqlangan" deb belgilash
--   claim_inventory_item(_by_type)— obuna login ma'lumotlarini olish
--   expire_unpaid_orders          — buyurtmalarni bekor qilish
--   refresh_monitoring_snapshot   — statistikani qayta hisoblash
--
-- Shuningdek `payment_history` view'i SECURITY DEFINER bo'lgani uchun ostidagi
-- jadvallarning RLS ini chetlab o'tib, to'lov tarixini anon ga ko'rsatardi.
--
-- Ilovaga ta'sir qilmaydi: shared/db.js dagi rpcRequest() bu funksiyalarni
-- service_role kaliti bilan chaqiradi va u huquqni saqlab qoladi.
--
-- Bu fayl Supabase'da 2026-08-21 da qo'llangan.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.credit_user_wallet(bigint, numeric, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_user_wallet(text, numeric) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_inventory_item(uuid, uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_inventory_item_by_type(uuid, uuid, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_notification(numeric, text, text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_unpaid_orders() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_monitoring_snapshot() FROM anon, authenticated, PUBLIC;

REVOKE ALL ON public.payment_history FROM anon, authenticated, PUBLIC;

-- SECURITY DEFINER funksiyada search_path qotiriladi: usiz chaqiruvchi
-- search_path ni o'zgartirib, funksiya ichidagi jadval nomlarini o'zinikiga
-- yo'naltirishi mumkin (huquq oshirish yo'li).
ALTER FUNCTION public.credit_user_wallet(bigint, numeric, text, text) SET search_path = public, pg_temp;

-- ---- Tekshirish ----
-- Quyidagi so'rov BO'SH natija qaytarishi kerak. Bo'sh bo'lmasa — anon roli
-- hali ham biror narsaga yeta oladi.
--
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relkind IN ('r','v')
--     AND has_table_privilege('anon', c.oid, 'SELECT')
--     AND NOT (c.relkind='r' AND c.relrowsecurity)
--   UNION ALL
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
