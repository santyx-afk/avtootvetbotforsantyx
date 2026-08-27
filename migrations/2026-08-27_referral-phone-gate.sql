-- 2026-08-27: bonuslar faqat tasdiqlangan telefon raqamidan keyin.
--
-- Sabab: shu kuni bitta akkaunt (7090746857) 32 soniya ichida 131 ta soxta
-- Telegram akkaunt bilan referal havolasini bosib, 655 000 UZS signup bonus
-- yig'di va sarflab ulgurdi; soxta akkauntlarning o'ziga esa 1 310 000 UZS
-- welcome bonus tushdi. Telegram akkauntini ochish bepul — pulni akkaunt
-- ochilganiga emas, SIM-karta tasdig'iga bog'laymiz: kontakt ulashish
-- Telegramning o'zidan keladi (webhook, isOwnContact) va soxtalab bo'lmaydi.
--
--   users.phone_verified_at    — raqam Telegram kontakt orqali TASDIQLANGAN
--                                payt. Mini App'da qo'lda terilgan raqam
--                                (save-contact) bu belgini OLMAYDI.
--   referrals.signup_bonus_at  — signup bonus to'langan payt; NULL bo'yicha
--                                atomik PATCH poyga himoyasi (welcome_bonus_at
--                                bilan bir xil naqsh).

alter table public.users add column if not exists phone_verified_at timestamptz;

-- Mavjud raqamli foydalanuvchilar (913 tadan ko'pi kontakt oqimidan o'tgan)
-- qayta tasdiqlashga majburlanmaydi. 131 soxta akkauntda raqam yo'q —
-- ular baribir tasdiqsiz qoladi.
update public.users
set phone_verified_at = coalesce(updated_at, now())
where phone is not null and phone_verified_at is null;

alter table public.referrals add column if not exists signup_bonus_at timestamptz;

-- Hozirgacha bo'lgan referallar: yo bonusi to'langan (jumladan nakrutka),
-- yo bonus davri boshlanmasidan oldingi eski yozuvlar — retroaktiv to'lov
-- bo'lmasligi uchun hammasi "yopilgan" deb belgilanadi.
update public.referrals
set signup_bonus_at = coalesce(updated_at, created_at)
where signup_bonus_at is null;
