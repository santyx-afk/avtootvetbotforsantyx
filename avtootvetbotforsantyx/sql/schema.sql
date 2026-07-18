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

create or replace function claim_inventory_item_by_type(p_plan_id uuid, p_order_id uuid, p_user_telegram_id text, p_type text)
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
     and type = p_type
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

-- Automatic HUMO Card Bot payment matching and cart checkout
alter table orders add column if not exists base_price numeric(12,2);
alter table orders add column if not exists unique_price numeric(12,2);
alter table orders add column if not exists expires_at timestamptz;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists payment_source text;
alter table orders add column if not exists payment_message_id text;

create index if not exists idx_orders_unique_price_waiting on orders(unique_price) where status = 'pending_payment';
create index if not exists idx_orders_expires_at_waiting on orders(expires_at) where status = 'pending_payment';

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  user_telegram_id text not null,
  plan_id uuid not null references plans(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_telegram_id, plan_id)
);
create index if not exists idx_cart_items_user on cart_items(user_telegram_id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  user_telegram_id text not null,
  plan_id uuid references plans(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_items_order on order_items(order_id);

create table if not exists payment_logs (
  id bigint generated always as identity primary key,
  source text not null,
  message_key text,
  amount numeric(12,2),
  order_id uuid references orders(id) on delete set null,
  status text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_payment_logs_message on payment_logs(source, message_key);

create table if not exists processed_payment_messages (
  id bigint generated always as identity primary key,
  source text not null,
  message_key text not null,
  amount numeric(12,2),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source, message_key)
);

-- Order lifecycle, auditability, wallet, referrals, promos, and exception handling
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in (
  'created',
  'waiting_payment',
  'payment_detected',
  'delivering',
  'completed',
  'expired',
  'cancelled',
  'failed',
  -- legacy statuses kept for backward compatibility with old admin/manual flows
  'pending_payment',
  'payment_uploaded',
  'checking',
  'approved',
  'rejected'
));
alter table orders add column if not exists delivery_attempts integer not null default 0;
alter table orders add column if not exists delivery_error text;
alter table orders add column if not exists promo_code text;
alter table orders add column if not exists discount_amount numeric(12,2) not null default 0;
alter table orders add column if not exists balance_used numeric(12,2) not null default 0;

alter table order_items add column if not exists inventory_item_id uuid references inventory_items(id) on delete set null;
alter table order_items add column if not exists delivery_status text not null default 'pending';
alter table order_items add column if not exists delivery_error text;
alter table order_items add column if not exists delivered_at timestamptz;
alter table order_items add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_order_items_inventory on order_items(inventory_item_id);

alter table payment_logs add column if not exists user_telegram_id text;
alter table payment_logs add column if not exists base_price numeric(12,2);
alter table payment_logs add column if not exists paid_amount numeric(12,2);
alter table payment_logs add column if not exists delivery_status text;
alter table payment_logs add column if not exists products jsonb not null default '[]'::jsonb;

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  order_id uuid references orders(id) on delete set null,
  user_telegram_id text,
  action text not null,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_order on audit_logs(order_id, created_at desc);
create index if not exists idx_audit_logs_action on audit_logs(action, created_at desc);

create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null default 0,
  is_one_time boolean not null default false,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_telegram_id text not null,
  referred_telegram_id text not null unique,
  status text not null default 'registered' check (status in ('registered', 'rewarded', 'cancelled')),
  reward_type text,
  reward_value numeric(12,2),
  first_order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists idx_referrals_referrer on referrals(referrer_telegram_id);

create table if not exists user_wallets (
  user_telegram_id text primary key,
  balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists wallet_transactions (
  id bigint generated always as identity primary key,
  user_telegram_id text not null,
  order_id uuid references orders(id) on delete set null,
  amount numeric(12,2) not null,
  type text not null check (type in ('credit', 'debit', 'refund', 'bonus')),
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_wallet_transactions_user on wallet_transactions(user_telegram_id, created_at desc);

create table if not exists exception_queue (
  id bigint generated always as identity primary key,
  order_id uuid references orders(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create or replace view payment_history as
select
  o.id as order_uuid,
  o.order_number as order_id,
  o.user_telegram_id as user_id,
  coalesce(jsonb_agg(jsonb_build_object('plan_id', oi.plan_id, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'total_price', oi.total_price)) filter (where oi.id is not null), '[]'::jsonb) as products,
  o.base_price,
  o.unique_price as paid_amount,
  o.paid_at as payment_time,
  o.status,
  o.delivery_status,
  o.created_at
from orders o
left join order_items oi on oi.order_id = o.id
group by o.id;

-- Production hardening: transactional payment confirmation, retry queue, scheduler metrics
create table if not exists delivery_retry_queue (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  retry_count integer not null default 0,
  next_retry_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(order_id)
);
create index if not exists idx_delivery_retry_due on delivery_retry_queue(status, next_retry_at);

create table if not exists monitoring_snapshots (
  id integer primary key default 1,
  orders_today integer not null default 0,
  revenue_today numeric(12,2) not null default 0,
  retries_today integer not null default 0,
  failed_deliveries integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function confirm_payment_notification(
  p_amount numeric,
  p_source text,
  p_message_key text,
  p_payload jsonb default '{}'::jsonb
)
returns table(status text, order_id uuid, order_number text, order_row jsonb)
language plpgsql
as $$
declare
  v_order orders;
begin
  -- Runs as a single PostgreSQL transaction. Any exception rolls back the processed-message insert and order update.
  insert into processed_payment_messages(source, message_key, amount, raw_payload)
  values (p_source, p_message_key, p_amount, p_payload)
  on conflict(source, message_key) do nothing;

  if not found then
    status := 'duplicate';
    order_id := null;
    order_number := null;
    order_row := null;
    return next;
    return;
  end if;

  select * into v_order
    from orders
   where unique_price = p_amount
     and status in ('waiting_payment', 'pending_payment')
   order by created_at asc
   for update skip locked
   limit 1;

  if not found then
    insert into payment_logs(source, message_key, amount, raw_payload, status)
    values (p_source, p_message_key, p_amount, p_payload, 'no_waiting_order');
    status := 'no_match';
    order_id := null;
    order_number := null;
    order_row := null;
    return next;
    return;
  end if;

  update orders
     set status = 'payment_detected',
         paid_at = now(),
         approved_at = now(),
         payment_source = p_source,
         payment_message_id = p_message_key,
         updated_at = now()
   where id = v_order.id
   returning * into v_order;

  insert into payment_logs(source, message_key, amount, paid_amount, base_price, order_id, user_telegram_id, raw_payload, status, delivery_status)
  values (p_source, p_message_key, p_amount, p_amount, v_order.base_price, v_order.id, v_order.user_telegram_id, p_payload, 'matched', v_order.delivery_status);

  insert into audit_logs(order_id, user_telegram_id, action, status, metadata)
  values (v_order.id, v_order.user_telegram_id, 'payment_detected', 'payment_detected', jsonb_build_object('amount', p_amount, 'message_key', p_message_key));

  status := 'matched';
  order_id := v_order.id;
  order_number := v_order.order_number;
  order_row := to_jsonb(v_order);
  return next;
end;
$$;

create or replace function expire_unpaid_orders()
returns integer
language plpgsql
as $$
declare
  v_order orders;
  v_count integer := 0;
begin
  for v_order in
    select * from orders
     where status in ('waiting_payment', 'pending_payment')
       and expires_at is not null
       and expires_at < now()
     for update skip locked
  loop
    update inventory_items
       set status = 'available',
           assigned_order_id = null,
           assigned_user_telegram_id = null,
           reserved_at = null
     where assigned_order_id = v_order.id
       and status = 'reserved';

    update orders
       set status = 'expired',
           delivery_status = 'failed',
           admin_comment = 'Payment timeout',
           updated_at = now()
     where id = v_order.id;

    insert into audit_logs(order_id, user_telegram_id, action, status, metadata)
    values (v_order.id, v_order.user_telegram_id, 'order_expired', 'expired', jsonb_build_object('expires_at', v_order.expires_at));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function refresh_monitoring_snapshot()
returns monitoring_snapshots
language plpgsql
as $$
declare
  v_row monitoring_snapshots;
begin
  insert into monitoring_snapshots(id, orders_today, revenue_today, retries_today, failed_deliveries, updated_at)
  values (
    1,
    (select count(*) from orders where created_at >= date_trunc('day', now())),
    coalesce((select sum(unique_price) from orders where paid_at >= date_trunc('day', now()) and status in ('payment_detected', 'delivering', 'completed')), 0),
    (select count(*) from delivery_retry_queue where created_at >= date_trunc('day', now())),
    (select count(*) from orders where delivery_status = 'failed')
  , now())
  on conflict(id) do update set
    orders_today = excluded.orders_today,
    revenue_today = excluded.revenue_today,
    retries_today = excluded.retries_today,
    failed_deliveries = excluded.failed_deliveries,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;
