-- 2026-10-12 — Ommaviy xabarni keyinroq yuborish (rejalashtirish)
--
-- Nima uchun: admin panel xabarni darhol emas, tanlangan vaqtda (masalan
-- ertaga 10:00 da) yuborishi kerak. Ish `scheduled` holatida kutadi;
-- maintenance cron (har 5 daqiqada) vaqti kelganini navbatga qo'yadi.
-- Qabul qiluvchilar ro'yxati yuborish paytida qayta olinadi — orada qo'shilgan
-- foydalanuvchilar ham xabar oladi.
--
-- Xavfsiz: yangi bo'sh ustun + holatlar ro'yxatiga 'scheduled' qo'shiladi.
-- Mavjud ishlar o'zgarmaydi. Idempotent.

alter table broadcast_jobs add column if not exists scheduled_at timestamptz;

alter table broadcast_jobs drop constraint if exists broadcast_jobs_status_check;
alter table broadcast_jobs add constraint broadcast_jobs_status_check
  check (status in ('awaiting_message', 'awaiting_confirm', 'scheduled', 'queued', 'sending', 'done', 'cancelled', 'failed'));

create index if not exists idx_broadcast_jobs_scheduled on broadcast_jobs (scheduled_at) where status = 'scheduled';
