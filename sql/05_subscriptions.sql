-- Obunalar jadvali: subscription-reminder.js shu jadval va uning
-- eslatma ustunlariga bog'liq, lekin jadval hech qachon yaratilmagan edi.
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  user_telegram_id text not null,
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

-- Jadval avval qo'lda yaratilgan bo'lsa ham ustunlar to'liq bo'lishi uchun
alter table subscriptions add column if not exists order_id uuid references orders(id) on delete set null;
alter table subscriptions add column if not exists plan_id uuid references plans(id) on delete set null;
alter table subscriptions add column if not exists plan_name text;
alter table subscriptions add column if not exists status text not null default 'active';
alter table subscriptions add column if not exists started_at timestamptz not null default now();
alter table subscriptions add column if not exists expires_at timestamptz;
alter table subscriptions add column if not exists reminder_3d_sent boolean not null default false;
alter table subscriptions add column if not exists reminder_1d_sent boolean not null default false;
alter table subscriptions add column if not exists expired_notified boolean not null default false;
alter table subscriptions add column if not exists created_at timestamptz not null default now();

alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check check (status in ('active', 'expired', 'cancelled'));

-- end_date reminder so'rovlarida ishlatiladi (end_date=eq.YYYY-MM-DD).
-- expires_at dan hosil qilinadi, shunda ikkalasi hech qachon farq qilmaydi.
-- Generated ustun immutable ifoda talab qiladi, shuning uchun UTC ga aniq o'girilgan.
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
