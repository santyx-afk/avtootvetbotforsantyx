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
