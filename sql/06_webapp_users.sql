-- Mini App (webapp-api) uchun users jadvaliga qo'shimcha ustunlar.
-- Idempotent — mavjud bazada qayta ishga tushirish xavfsiz.

-- Telefon raqami (birinchi ochilishda requestContact orqali olinadi)
alter table users add column if not exists phone text;

-- Tug'ilgan kun (Telegram profildan yoki qo'lda) — tug'ilgan kun chegirmasi uchun
alter table users add column if not exists birthday date;

-- Telegram profil rasmi URL'i
alter table users add column if not exists photo_url text;

-- Mini App'da tanlangan til (mavjud language_code dan ustun turadi)
alter table users add column if not exists webapp_lang text;

-- Qidiruv uchun index (admin panel foydalanuvchilar bo'limi uchun)
create index if not exists idx_users_phone on users(phone);
