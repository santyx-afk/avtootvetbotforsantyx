-- 2026-10-12 — Bir guruh foydalanuvchiga balans qo'shish (credit_users)
--
-- Nima uchun: ilgari balansni yo bitta odamga, yo hammaga birdan (credit_all_users)
-- qo'shish mumkin edi. Endi admin panel segment (xarid qilganlar, balansi
-- borlar, teg bo'yicha va h.k.) tanlaydi, server o'sha ro'yxatni shu funksiyaga
-- beradi.
--
-- Xavfsizlik va ishonchlilik:
--   * Hammasi BITTA tranzaksiyada: yo hammaga qo'shiladi, yo hech kimga.
--     `balance + excluded.balance` — atomik ortirish (poyga holati yo'q).
--   * Takroriy bosish himoyasi: har bir amal noyob `p_request_id` bilan keladi.
--     `admin_bulk_credits` jadvalidagi PRIMARY KEY ikkinchi urinishni rad etadi
--     va butun tranzaksiya bekor bo'ladi — pul ikki marta qo'shilmaydi.
--   * `admin_bulk_credits` — guruhga qo'shilgan pullar tarixi ham.
--   * Bloklangan foydalanuvchilar chetda qoladi.
--   * Funksiya faqat service_role (Netlify funksiyalari) uchun ochiq.
--
-- Idempotent — qayta ishga tushirilsa ham buzilmaydi.

create table if not exists public.admin_bulk_credits (
  request_id text primary key,
  segment text,
  amount numeric(12,2) not null,
  description text,
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.admin_bulk_credits enable row level security;

create or replace function public.credit_users(
  p_ids text[],
  p_amount numeric,
  p_description text default null,
  p_request_id text default null,
  p_segment text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount noldan katta bo''lishi kerak';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  -- Takroriy so'rov bo'lsa shu yerda unique_violation — hech narsa yozilmaydi
  if p_request_id is not null then
    insert into public.admin_bulk_credits (request_id, segment, amount, description)
    values (p_request_id, p_segment, p_amount, p_description);
  end if;

  insert into public.wallet_transactions (user_telegram_id, amount, type, description, admin_id)
  select u.telegram_id, p_amount, 'admin_credit', p_description, 'web_admin'
    from public.users u
   where u.telegram_id = any(p_ids)
     and coalesce(u.is_blocked, false) = false;

  insert into public.user_wallets (user_telegram_id, balance, updated_at)
  select u.telegram_id, p_amount, now()
    from public.users u
   where u.telegram_id = any(p_ids)
     and coalesce(u.is_blocked, false) = false
      on conflict (user_telegram_id)
      do update set balance = public.user_wallets.balance + excluded.balance,
                    updated_at = now();

  get diagnostics v_affected = row_count;

  if p_request_id is not null then
    update public.admin_bulk_credits set recipients = v_affected where request_id = p_request_id;
  end if;
  return v_affected;
end;
$$;

revoke all on function public.credit_users(text[], numeric, text, text, text) from public;
revoke all on function public.credit_users(text[], numeric, text, text, text) from anon;
revoke all on function public.credit_users(text[], numeric, text, text, text) from authenticated;
grant execute on function public.credit_users(text[], numeric, text, text, text) to service_role;
