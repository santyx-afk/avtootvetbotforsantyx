-- Faza 4 (Profil) uchun jadval va ustunlar.
-- Idempotent — qayta ishga tushirish xavfsiz.

-- Balans to'ldirishda hamyonga tushadigan summa (cashback bilan; to'langan summadan farq qilishi mumkin)
alter table orders add column if not exists topup_credit numeric(12,2);

-- Umumiy sozlamalar (admin panel Faza 6 da tahrirlaydi; hozircha defaultlar)
alter table settings add column if not exists cashback_enabled boolean not null default false;
alter table settings add column if not exists cashback_percent numeric not null default 10;
alter table settings add column if not exists referral_percent numeric not null default 10;
alter table settings add column if not exists referral_fixed_bonus numeric not null default 0;
alter table settings add column if not exists min_topup numeric not null default 5000;
alter table settings add column if not exists birthday_discount_percent numeric not null default 10;

-- FAQ (admin panel boshqaradi, tartib o'zgartiriladi)
create table if not exists faq (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  lang text,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_faq_active on faq(is_active, sort_order);
