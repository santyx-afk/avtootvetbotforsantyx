-- 2026-10-12 — Qo'llab-quvvatlash: bot ichidagi murojaatlar va admin javoblari
--
-- Nima uchun: ilgari "Admin bilan bog'lanish" mijozni boshqa Telegram
-- akkauntga yuborardi — yozishmalar hech qayerda saqlanmas, mijoz qaysi
-- buyurtma haqida yozayotgani noma'lum edi. Endi mijoz botning o'zida yozadi
-- (oxirgi buyurtma raqami avtomatik biriktiriladi), xabar shu jadvalga
-- tushadi, adminlarga Telegram'da nusxasi boradi, admin panelning
-- "Murojaatlar" bo'limida o'qiladi va o'sha yerdan javob yoziladi.
--
--   direction: 'in'  — mijozdan; 'out' — admin javobi
--   file_id/file_type — rasm/fayl (Telegram file_id; nusxasi adminlarga boradi)
--   is_read — admin panelda ochilganmi (faqat 'in' uchun ma'noli)
--
-- Xavfsiz: yangi jadval, mavjud ma'lumotga tegmaydi. Idempotent.
-- Qo'llanmaguncha bot eski "Admin bilan bog'lanish" havolasini beradi.

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  user_telegram_id text not null,
  direction text not null check (direction in ('in', 'out')),
  text text,
  file_id text,
  file_type text,
  order_id uuid references public.orders(id) on delete set null,
  order_number text,
  admin_name text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_messages_user on public.support_messages (user_telegram_id, created_at desc);
create index if not exists idx_support_messages_recent on public.support_messages (created_at desc);
create index if not exists idx_support_messages_unread on public.support_messages (user_telegram_id)
  where direction = 'in' and is_read = false;

-- Boshqa jadvallar kabi RLS yoqiq; faqat service_role (Netlify funksiyalari) o'qiydi/yozadi.
alter table public.support_messages enable row level security;
