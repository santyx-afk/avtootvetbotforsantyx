-- webapp-api.js ishlatadigan, lekin bazada yo'q bo'lgan jadvallar.
-- Bularsiz toggle_wishlist va join_waitlist so'rovlari xatoga uchraydi.

-- Saralanganlar (wishlist). Frontend asosan localStorage ishlatadi,
-- lekin server nusxasi ham profile javobida qaytariladi.
create table if not exists user_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_telegram_id text not null,
  plan_id uuid not null references plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_telegram_id, plan_id)
);
create index if not exists idx_user_wishlist_user on user_wishlist(user_telegram_id);

-- Zaxira tugaganda "navbatga qo'shish" (stock waitlist)
create table if not exists stock_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_telegram_id text not null,
  plan_id uuid not null references plans(id) on delete cascade,
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_telegram_id, plan_id)
);
create index if not exists idx_stock_waitlist_plan on stock_waitlist(plan_id) where notified = false;
