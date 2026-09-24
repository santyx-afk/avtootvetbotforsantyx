-- 2026-09-23 · 2-bosqich mustahkamlash (PR #66 davomi)
--
-- Bu migratsiya IXTIYORIY, lekin TAVSIYA etiladi. Kod migratsiyasiz ham
-- ishlayveradi (buzilmaydi) — quyidagilar himoyani DB darajasida kuchaytiradi.
-- Migratsiyalar qo'lda ishga tushiriladi: Supabase Dashboard → SQL Editor.

-- ----------------------------------------------------------------------------
-- 1) unique_price to'qnashuviga qarshi (partial unique index)
--
-- To'lov summasi (unique_price) HumoCardBot to'lovini buyurtmaga bog'lash uchun
-- ishlatiladi. Bir vaqtda ikki checkout bir xil suffiksni olib qolsa, bittasining
-- to'lovi boshqasiga tushib qolishi mumkin edi. Bu index bir vaqtning o'zida
-- to'lov kutayotgan ikki buyurtmada bir xil unique_price bo'lishiga yo'l qo'ymaydi;
-- kod (createCheckoutOrder / topup) INSERT rad etilsa suffiksni qayta generatsiya
-- qiladi.
--
-- DIQQAT: agar HOZIR to'lov kutayotgan bir nechta buyurtmada bir xil unique_price
-- bo'lsa, index yaratilmaydi (xato beradi). Bunday buyurtmalar bir necha daqiqada
-- muddati o'tib yo'qoladi — shunda qayta ishga tushiring. Zarur bo'lsa avval:
--   update orders set status='expired'
--    where status in ('waiting_payment','pending_payment') and expires_at < now();
create unique index if not exists orders_unique_price_waiting_idx
  on orders (unique_price)
  where status in ('waiting_payment', 'pending_payment')
    and unique_price is not null
    and unique_price > 0;

-- ----------------------------------------------------------------------------
-- 2) Takroriy Telegram update'laridan himoya (idempotentlik)
--
-- Telegram javob kechiksa o'sha update'ni qayta yuborishi mumkin. processed_updates
-- har update_id ni bir marta qayd etadi; webhook takror kelganini o'tkazib yuboradi.
-- Jadval bo'lmasa kod fail-open ishlaydi (bot to'xtamaydi), shuning uchun bu
-- migratsiya majburiy emas, lekin tavsiya etiladi.
create table if not exists processed_updates (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);
-- Eski yozuvlarni tozalash uchun (webhook vaqti-vaqti bilan o'chiradi) — index.
create index if not exists idx_processed_updates_created on processed_updates(created_at);
