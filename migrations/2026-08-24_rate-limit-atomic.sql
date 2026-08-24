-- 2026-08-24: chastota chegarasini atomik qilish (login kodi 4 xonaga tushishi oldidan).
--
-- Muammo: shared/rate-limit.js ilgari "o'qi → hisobla → yoz" yo'li bilan
-- ishlar edi. Parallel so'rovlar bir vaqtda o'qiganda hammasi bir xil
-- hisoblagichni ko'radi: bitta IP dan bir zumda yuborilgan yuzlab so'rov
-- birinchi yozuv bazaga yetib borgunicha chegarani sezmay o'tib ketishi
-- mumkin edi. Kod 8 xonali paytida bu jiddiy emas edi; kod 4 xonaga
-- tushirilgach (9 000 variant) bunday teshik qoldirib bo'lmaydi.
--
-- Yechim: hisoblash bazaning o'zida bitta atomik amalda bajariladi —
-- INSERT ... ON CONFLICT DO UPDATE qator qulfida navbatlashadi, shuning
-- uchun har bir so'rov aynan bir marta hisoblanadi.
--
-- Farq: ilgari blok tugaganda hisoblagich 0 dan boshlanardi; endi oyna
-- hali tirik bo'lsa hisob davom etadi — qayta urinayotgan hujumchi darhol
-- yana bloklanadi (qat'iyroq, ataylab shunday).

create or replace function public.rate_limit_hit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  insert into public.rate_limits as rl (scope, key, attempts, window_start, blocked_until, updated_at)
  values (
    p_scope, p_key, 1, v_now,
    case when 1 > p_limit then v_now + make_interval(secs => p_block_seconds) end,
    v_now
  )
  on conflict (scope, key) do update set
    -- Blok davom etayotganda qator o'zgarmaydi: rad etilgan urinishlar
    -- blokni uzaytirmaydi (NULL blocked_until bilan taqqoslash false beradi).
    attempts = case
      when rl.blocked_until > v_now then rl.attempts
      when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1
      else rl.attempts + 1
    end,
    window_start = case
      when rl.blocked_until > v_now then rl.window_start
      when rl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
      else rl.window_start
    end,
    blocked_until = case
      when rl.blocked_until > v_now then rl.blocked_until
      when (case when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1 else rl.attempts + 1 end) > p_limit
        then v_now + make_interval(secs => p_block_seconds)
    end,
    updated_at = v_now
  returning * into v_row;

  if v_row.blocked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after', greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now))))::int
    );
  end if;
  return jsonb_build_object('allowed', true);
end;
$$;

-- PostgREST public sxemadagi funksiyalarni /rest/v1/rpc/ ostida avtomatik
-- ochadi — shuning uchun ruxsat faqat service_role ga qoldiriladi
-- (credit_all_users bilan bir xil tartib).
revoke execute on function public.rate_limit_hit(text, text, integer, integer, integer) from public;
revoke execute on function public.rate_limit_hit(text, text, integer, integer, integer) from anon;
revoke execute on function public.rate_limit_hit(text, text, integer, integer, integer) from authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer, integer) to service_role;
