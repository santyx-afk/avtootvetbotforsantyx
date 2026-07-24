-- Balans to'ldirish (topup) buyurtmalarini oddiy xaridlardan ajratish
alter table orders add column if not exists order_type text not null default 'purchase';
alter table orders drop constraint if exists orders_order_type_check;
alter table orders add constraint orders_order_type_check check (order_type in ('purchase', 'topup'));

create index if not exists idx_orders_order_type on orders(order_type);

-- Balansni atomik oshirish/kamaytirish (parallel to'lovlarda yo'qotish bo'lmasligi uchun)
create or replace function credit_user_wallet(p_user_telegram_id text, p_amount numeric)
returns user_wallets
language plpgsql
as $$
declare
  v_row user_wallets;
begin
  insert into user_wallets(user_telegram_id, balance, updated_at)
  values (p_user_telegram_id, p_amount, now())
  on conflict (user_telegram_id) do update
     set balance = user_wallets.balance + excluded.balance,
         updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;
