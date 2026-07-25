-- Obunalar jadvali: subscription-reminder.js, webapp-api.js (profile) va
-- db.createSubscriptionFromOrder shu jadvalga bog'liq.
--
-- MUHIM: ba'zi muhitlarda subscriptions jadvali AVVAL boshqacha sxema bilan
-- yaratilgan (user_id, product_id, product_name — kod bularni ishlatmaydi,
-- lekin ular NOT NULL edi; user_telegram_id/plan_id/plan_name esa umuman yo'q edi).
-- Natijada:
--   * profile so'rovi (user_telegram_id bo'yicha filtr) 400 qaytarardi;
--   * createSubscriptionFromOrder INSERT i NOT NULL ustunlar tufayli yiqilardi.
-- Quyidagi migratsiya ikkala holatni ham (yangi DB va eski sxema) bir xil,
-- kod kutgan holatga keltiradi. Idempotent — qayta ishga tushirish xavfsiz.

-- Yangi o'rnatish uchun bazaviy jadval (mavjud bo'lsa tegilmaydi)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  user_telegram_id text,
  plan_id uuid references plans(id) on delete set null,
  plan_name text,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  reminder_3d_sent boolean not null default false,
  reminder_1d_sent boolean not null default false,
  expired_notified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(order_id)
);

-- Kod o'qiydigan/yozadigan ustunlar (eski sxemada yo'q bo'lsa qo'shiladi)
alter table subscriptions add column if not exists user_telegram_id text;
alter table subscriptions add column if not exists plan_id uuid;
alter table subscriptions add column if not exists plan_name text;
alter table subscriptions add column if not exists started_at timestamptz default now();
alter table subscriptions add column if not exists expires_at timestamptz;
alter table subscriptions add column if not exists reminder_3d_sent boolean not null default false;
alter table subscriptions add column if not exists reminder_1d_sent boolean not null default false;
alter table subscriptions add column if not exists expired_notified boolean not null default false;
alter table subscriptions add column if not exists created_at timestamptz not null default now();

-- Eski majburiy ustunlarni ixtiyoriy qilish: kod ularni to'ldirmaydi
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='user_id') then
    execute 'alter table subscriptions alter column user_id drop not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='product_id') then
    execute 'alter table subscriptions alter column product_id drop not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='product_name') then
    execute 'alter table subscriptions alter column product_name drop not null';
  end if;
end $$;

-- end_date reminder so'rovlarida ishlatiladi (end_date=eq.YYYY-MM-DD).
-- expires_at dan generated stored ustun sifatida olinadi, shunda u har doim mos keladi.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'end_date'
  ) then
    alter table subscriptions
      add column end_date date generated always as ((expires_at at time zone 'UTC')::date) stored;
  end if;
end $$;

create index if not exists idx_subscriptions_user on subscriptions(user_telegram_id, created_at desc);
create index if not exists idx_subscriptions_due on subscriptions(status, end_date);
