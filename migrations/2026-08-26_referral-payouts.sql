-- 2026-08-26: referal bonuslari uchun to'lov jurnali (referral_payouts).
--
-- Nega kerak: processReferralPayout idempotentlikni audit_logs dan O'QIB
-- tekshirardi, o'z yozuvini esa jarayonning OXIRIDA yozardi. 2026-08-23 da
-- jarayon o'rtada uzilib (ehtimol funksiya timeouti) pul to'landi-yu, na
-- referrals yangilandi, na audit yozildi — o'sha buyurtma qayta yetkazilsa
-- bonus IKKINCHI marta to'lanadigan holat ochiq qoldi. Endi "da'vo" (claim)
-- BIRINCHI qadamda shu jadvalga yoziladi va PRIMARY KEY (order_id) takror
-- to'lovni bazaning o'zida to'sadi. Jadval ayni paytda admin panel uchun
-- to'lovlar tarixi hamdir.

create table if not exists public.referral_payouts (
  order_id uuid primary key references public.orders(id) on delete cascade,
  referrer_telegram_id text not null,
  referred_telegram_id text not null,
  amount numeric not null default 0,
  -- percent — avtomatik (xariddan foiz); manual — admin panel orqali qo'lda
  kind text not null default 'percent' check (kind in ('percent','manual')),
  admin_id text,
  created_at timestamptz not null default now()
);

-- Boshqa jadvallar bilan bir xil tartib: RLS yoqiq, kirish service_role orqali.
alter table public.referral_payouts enable row level security;

create index if not exists idx_referral_payouts_referrer
  on public.referral_payouts (referrer_telegram_id);

-- Backfill: 2026-08-23 dagi to'langan-lekin-yozilmagan payout.
-- Dalil wallet_transactions da: "Referal 10% (#1286053845 xaridi)", 6 499 UZS,
-- 2026-08-23 15:27:53+00. O'sha kuni bu foydalanuvchining bitta 'completed'
-- buyurtmasi bor.
insert into public.referral_payouts (order_id, referrer_telegram_id, referred_telegram_id, amount, kind, created_at)
select o.id, '7373966137', '1286053845', 6499, 'percent', timestamptz '2026-08-23 15:27:53+00'
from public.orders o
where o.user_telegram_id = '1286053845'
  and o.status = 'completed'
  and o.created_at::date = date '2026-08-23'
order by o.created_at desc
limit 1
on conflict (order_id) do nothing;

-- referrals qatorini haqiqatga moslash (pul allaqachon to'langan edi, lekin
-- hisob yangilanmagan). total_earned=0 sharti migratsiyani qayta ishga
-- tushirishda keyingi hisoblarni buzmaslik uchun.
update public.referrals r
set status = 'rewarded',
    total_earned = 6499,
    purchase_count = 1,
    first_order_id = p.order_id,
    updated_at = now()
from public.referral_payouts p
where p.referred_telegram_id = '1286053845'
  and r.referred_telegram_id = '1286053845'
  and r.total_earned = 0;
