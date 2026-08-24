-- 2026-08-24 · Promokodni tovarga bog'lash + xush kelibsiz bonusi
-- PR #54 ga qo'shimcha.
--
-- 1) promo_codes.plan_ids — promokod qaysi rejalarga (tovarlarga) tegishli.
--    NULL yoki bo'sh massiv = barcha tovarlarga (eski xatti-harakat saqlanadi,
--    shuning uchun mavjud promokodlar o'zgarishsiz ishlaydi).
-- 2) settings.welcome_bonus — yangi foydalanuvchiga beriladigan bonus (UZS).
--    0 bo'lsa bonus berilmaydi.
-- 3) users.welcome_bonus_at — bonus qachon berilgani. NULL bo'lsa hali
--    berilmagan. Bonus shu ustun orqali FAQAT BIR MARTA beriladi: kod
--    `... &welcome_bonus_at=is.null` sharti bilan UPDATE qiladi, ya'ni ikkita
--    parallel so'rovdan faqat bittasi qatorni yangilay oladi va bonusni
--    beradi (poyga holatida ikki marta to'lanmaydi).
--
-- Idempotent: ikki marta ishga tushirilsa ham buzilmaydi.

alter table public.promo_codes
  add column if not exists plan_ids uuid[];

comment on column public.promo_codes.plan_ids is
  'Promokod amal qiladigan rejalar. NULL/bo''sh = barcha rejalar.';

alter table public.settings
  add column if not exists welcome_bonus numeric not null default 0;

comment on column public.settings.welcome_bonus is
  'Yangi foydalanuvchi balansiga avtomatik qo''shiladigan summa (UZS). 0 = o''chiq.';

alter table public.users
  add column if not exists welcome_bonus_at timestamptz;

comment on column public.users.welcome_bonus_at is
  'Xush kelibsiz bonusi berilgan vaqt. NULL = hali berilmagan.';

-- Mavjud foydalanuvchilar bonusni olmasin: ular yangi emas.
-- (Ustun endi qo'shilgani uchun hammasida NULL — shuning uchun ularni
-- "berilgan" deb belgilaymiz, aks holda keyingi kirishlarida bonus olishardi.)
update public.users
   set welcome_bonus_at = now()
 where welcome_bonus_at is null;

-- Bonus summasini o'rnatish (settings bitta qatordan iborat).
update public.settings
   set welcome_bonus = 10000
 where welcome_bonus = 0;
