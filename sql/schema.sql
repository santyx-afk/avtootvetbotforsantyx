create extension if not exists pgcrypto;

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  username text,
  telegram_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null unique,
  username text,
  full_name text,
  language_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_states (
  telegram_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  button_label text,
  description text,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  parent_plan_id uuid references plans(id) on delete cascade,
  name text not null,
  button_label text,
  price numeric(12,2) not null default 0,
  currency text not null default 'UZS',
  duration text,
  warranty_text text,
  description text,
  how_it_works_text text,
  payment_instructions text,
  delivery_type text not null default 'manual' check (delivery_type in ('manual', 'auto_account', 'license_key', 'instruction_only')),
  delivery_instructions text,
  old_price numeric(12,2),
  is_popular boolean not null default false,
  tags text[] not null default '{}',
  rules_text text,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(category_id, name, parent_plan_id)
);

create table if not exists settings (
  id integer primary key default 1,
  seller_card_number text,
  seller_display_name text,
  admin_telegram_id text,
  welcome_text text,
  contact_text text,
  support_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  telegram_id text,
  category_id uuid references categories(id) on delete set null,
  plan_id uuid references plans(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists receipt_submissions (
  id bigint generated always as identity primary key,
  telegram_id text not null,
  category_id uuid references categories(id) on delete set null,
  plan_id uuid references plans(id) on delete set null,
  telegram_message_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references users(id) on delete set null,
  user_telegram_id text not null,
  plan_id uuid references plans(id) on delete set null,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending_payment' check (status in (
    'pending_payment',
    'payment_uploaded',
    'checking',
    'approved',
    'rejected',
    'completed',
    'cancelled'
  )),
  payment_method text,
  receipt_submission_id bigint references receipt_submissions(id) on delete set null,
  receipt_file_id text,
  receipt_file_type text,
  admin_comment text,
  delivery_status text not null default 'waiting_approval' check (delivery_status in (
    'not_required',
    'waiting_approval',
    'waiting_stock',
    'manual_required',
    'delivered',
    'failed'
  )),
  inventory_item_id uuid references inventory_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  receipt_uploaded_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz
);

alter table plans add column if not exists delivery_type text not null default 'manual';
alter table plans add column if not exists delivery_instructions text;
alter table plans add column if not exists old_price numeric(12,2);
alter table plans add column if not exists is_popular boolean not null default false;
alter table plans add column if not exists tags text[] not null default '{}';
alter table plans drop constraint if exists plans_delivery_type_check;
alter table plans add constraint plans_delivery_type_check check (delivery_type in ('manual', 'auto_account', 'license_key', 'instruction_only'));

alter table receipt_submissions add column if not exists order_id uuid references orders(id) on delete set null;

create index if not exists idx_orders_user_telegram_id on orders(user_telegram_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_plan_id on orders(plan_id);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  type text not null check (type in ('auto_account', 'license_key')),
  title text,
  login text,
  password_encrypted text,
  license_key_encrypted text,
  extra_data_encrypted text,
  status text not null default 'available' check (status in ('available', 'reserved', 'delivered', 'sold', 'disabled')),
  assigned_order_id uuid references orders(id) on delete set null,
  assigned_user_telegram_id text,
  created_at timestamptz not null default now(),
  reserved_at timestamptz,
  delivered_at timestamptz,
  sold_at timestamptz,
  notes text
);

create table if not exists delivery_logs (
  id bigint generated always as identity primary key,
  order_id uuid references orders(id) on delete set null,
  user_telegram_id text,
  plan_id uuid references plans(id) on delete set null,
  inventory_item_id uuid references inventory_items(id) on delete set null,
  delivery_type text,
  delivered_at timestamptz,
  admin_telegram_id text,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create or replace function claim_inventory_item(p_plan_id uuid, p_order_id uuid, p_user_telegram_id text)
returns setof inventory_items
language plpgsql
as $$
declare
  v_item inventory_items;
begin
  select *
    into v_item
    from inventory_items
   where plan_id = p_plan_id
     and status = 'available'
   order by created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update inventory_items
     set status = 'reserved',
         assigned_order_id = p_order_id,
         assigned_user_telegram_id = p_user_telegram_id,
         reserved_at = now()
   where id = v_item.id
   returning * into v_item;

  return next v_item;
end;
$$;
