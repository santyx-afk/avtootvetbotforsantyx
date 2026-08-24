-- 2026-08-24 · Hamma foydalanuvchi balansini bittada to'ldirish
-- PR #54 ga qo'shimcha.
--
-- Nima uchun SQL funksiya:
--   Admin panelda "hammaga qo'shish" tugmasi bosilganda ~900 foydalanuvchi
--   balansini o'zgartirish kerak. Buni REST orqali qilsak ~1800 ta so'rov
--   ketadi va Netlify funksiyasi timeout bo'ladi. Bundan tashqari "o'qib ol,
--   qo'shib qo'y, qaytar" usuli poyga holatiga ochiq: shu paytda foydalanuvchi
--   xarid qilsa balansi ustidan yozib yuboriladi.
--   Bu funksiya hammasini BITTA tranzaksiyada, `balance + excluded.balance`
--   ko'rinishidagi atomik ortirish bilan bajaradi.
--
-- Bloklangan foydalanuvchilar chetda qoladi.
-- Qaytaradi: nechta foydalanuvchi hamyoni yangilangani.

create or replace function public.credit_all_users(
  p_amount numeric,
  p_description text default null
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

  insert into public.wallet_transactions (user_telegram_id, amount, type, description, admin_id)
  select u.telegram_id, p_amount, 'admin_credit', p_description, 'web_admin'
    from public.users u
   where coalesce(u.is_blocked, false) = false;

  insert into public.user_wallets (user_telegram_id, balance, updated_at)
  select u.telegram_id, p_amount, now()
    from public.users u
   where coalesce(u.is_blocked, false) = false
      on conflict (user_telegram_id)
      do update set balance = public.user_wallets.balance + excluded.balance,
                    updated_at = now();

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

-- MUHIM: PostgREST `public` sxemadagi har bir funksiyani /rest/v1/rpc/<nom>
-- manzilida ochib qo'yadi. Bu funksiya SECURITY DEFINER — ya'ni RLS ni chetlab
-- o'tadi. Anon kalit bilan chaqirib bo'lmasligi uchun huquqlar olib tashlanadi;
-- faqat service_role (Netlify funksiyalari) chaqira oladi.
revoke all on function public.credit_all_users(numeric, text) from public;
revoke all on function public.credit_all_users(numeric, text) from anon;
revoke all on function public.credit_all_users(numeric, text) from authenticated;
grant execute on function public.credit_all_users(numeric, text) to service_role;
