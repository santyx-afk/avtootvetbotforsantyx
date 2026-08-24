-- 2026-08-24 · Rejalarga URL nomi (slug)
--
-- Nima uchun: har bir obuna uchun qidiruv tizimlari o'qiy oladigan alohida
-- sahifa ochiladi (`/obuna/canva-pro`). URL manzili chiroyli va barqaror
-- bo'lishi kerak — reja nomi o'zgarsa ham havola buzilmasin.
--
-- Slug faqat kichik lotin harflari, raqam va chiziqcha bo'ladi.
-- Yangi reja qo'shilganda admin panel uni nomdan avtomatik yasaydi, keyin
-- qo'lda tahrirlash mumkin.
--
-- Idempotent: ikki marta ishga tushirilsa ham buzilmaydi.

alter table public.plans
  add column if not exists slug text;

comment on column public.plans.slug is
  'Ochiq sahifa manzili: /obuna/<slug>. Bo''sh bo''lsa sahifa ochilmaydi.';

-- Bir xil slug ikkita rejada bo'lmasin (NULL lar cheklovga tushmaydi).
create unique index if not exists plans_slug_key on public.plans (slug)
  where slug is not null;

-- Mavjud rejalarga qo'lda tanlangan, qidiruvga qulay nomlar.
-- (Avtomatik yasalganda "capcut-pro-1-oylik" kabi uzun chiqardi.)
update public.plans set slug = 'capcut-pro'          where id = 'c8c2cc1e-ba82-4670-b548-d5ea020f5d02' and slug is null;
update public.plans set slug = 'captions-pro'        where id = '2e884f44-260e-4dbf-b613-9841d0700284' and slug is null;
update public.plans set slug = 'adobe-creative-cloud' where id = '0066463a-7a51-4a98-99d5-4abeaece6fe6' and slug is null;
update public.plans set slug = 'canva-pro'           where id = 'a760bea6-f949-47ec-9ebc-287ac6be8967' and slug is null;
update public.plans set slug = 'gemini-ai-ultra'     where id = 'b9e0c181-b7da-446a-99c8-6abb2de7e0fa' and slug is null;
update public.plans set slug = 'gemini-ai-pro'       where id = '6e1f529a-a980-4928-bb50-bc84db5dce14' and slug is null;
update public.plans set slug = 'alight-motion-pro'   where id = '12449fc2-56f1-46ee-8b75-d367b5290c94' and slug is null;
update public.plans set slug = 'persona-pro'         where id = 'f3879e80-eec4-40fe-b526-b80a380c6bf6' and slug is null;

-- Tekshirish: faol rejalarda slug bo'sh qolmasin.
--
--   SELECT name FROM public.plans
--    WHERE is_active = true AND parent_plan_id IS NULL AND slug IS NULL;
