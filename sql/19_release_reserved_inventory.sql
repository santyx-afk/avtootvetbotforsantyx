-- ============================================================
-- Bir martalik tozalash: "reserved" holatida qotib qolgan inventarni ozod qilish
-- ============================================================
-- Sabab: reserved inventory tizimi olib tashlandi — checkout endi akkauntni band
-- QILMAYDI, stock faqat to'lov tasdiqlangach tekshiriladi.
-- Ilgari checkout ochilganda band qilingan, lekin to'lov qilinmagan akkauntlar
-- "reserved" holatida ABADIY qulflanib qolar edi (foydalanuvchi ilovani yopsa,
-- taymer to'xtab, inventar qaytmasdi). Bu skript o'sha akkauntlarni "available"
-- ga qaytaradi.
--
-- Xavfsizlik: faol yetkazishga xalaqit bermaslik uchun faqat 10 daqiqadan eski
-- reservlar ozod qilinadi (yangi to'lovlar mid-delivery holatiga tegmaydi).
--
-- MUHIM: bu skript AVTOMATIK ishga tushmaydi. Uni bir marta qo'lda bajaring
-- (masalan Supabase SQL editor'da). Avval (1) SELECT bilan tekshiring, so'ng
-- (2) UPDATE'ni bajaring.

-- 1) Nechta akkaunt qulflanib qolgan? (faqat tekshirish — hech narsani o'zgartirmaydi)
SELECT plan_id, count(*) AS stuck_reserved
  FROM inventory_items
 WHERE status = 'reserved'
   AND (reserved_at IS NULL OR reserved_at < now() - interval '10 minutes')
 GROUP BY plan_id
 ORDER BY stuck_reserved DESC;

-- 2) Qulflangan akkauntlarni "available" ga qaytarish
UPDATE inventory_items
   SET status = 'available',
       assigned_order_id = NULL,
       assigned_user_telegram_id = NULL,
       reserved_at = NULL
 WHERE status = 'reserved'
   AND (reserved_at IS NULL OR reserved_at < now() - interval '10 minutes');

-- 3) (ixtiyoriy) Eski buyurtmalardagi "reserved" order_items yozuvlarini tozalash
UPDATE order_items
   SET delivery_status = 'pending',
       inventory_item_id = NULL
 WHERE delivery_status = 'reserved';

-- Eslatma: inventory_items jadvalidagi 'reserved' status qiymati va reserved_at
-- ustuni SXEMADA QOLDIRILDI (mavjud ma'lumotni buzmaslik uchun). Endi ular
-- ishlatilmaydi — bu skriptdan keyin barcha inventar 'available' yoki 'sold' bo'ladi.
