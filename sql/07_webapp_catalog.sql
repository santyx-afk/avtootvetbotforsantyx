-- Faza 2 (Katalog) uchun jadval va ustunlar.
-- Idempotent — mavjud bazada qayta ishga tushirish xavfsiz.

-- Obuna logosi/rasmi (Supabase Storage public URL)
alter table plans add column if not exists image_url text;

-- Umumiy qoidalar matni (har bir obunaning alohida qoidalari plans.rules_text da)
alter table settings add column if not exists general_terms text;

-- Sharhlar (matnli + yulduzli baho). Bir foydalanuvchi bir obunaga bitta sharh.
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  user_telegram_id text not null,
  user_name text,
  rating integer not null check (rating between 1 and 5),
  text text,
  admin_reply text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, user_telegram_id)
);
create index if not exists idx_reviews_plan on reviews(plan_id) where is_hidden = false;

-- Sevimlilar (wishlist)
create table if not exists wishlist (
  id uuid primary key default gen_random_uuid(),
  user_telegram_id text not null,
  plan_id uuid not null references plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_telegram_id, plan_id)
);
create index if not exists idx_wishlist_user on wishlist(user_telegram_id);

-- Bannerlar (katalog tepasida, muddati tugasa yo'qoladi)
create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  link text,
  is_active boolean not null default true,
  sort_order integer not null default 1,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_banners_active on banners(is_active, sort_order);
