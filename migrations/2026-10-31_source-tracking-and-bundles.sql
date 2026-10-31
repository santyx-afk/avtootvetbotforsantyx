-- ============================================================
-- MANBA O'LCHASH (acquisition source) + TO'PLAMLAR (bundle)
-- ============================================================
-- Sana: 2026-10-31
-- PR: "Manba o'lchash, ijtimoiy isbot, referal reklamasi, to'plamlar"
--
-- NIMA UCHUN KERAK
--
-- 1) Manba o'lchash. Hozir reklama qayerda ishlayotgani ko'rinmaydi: bot
--    ?start= payload'ini faqat 3 holatda (web_login, support, ref_<id>)
--    taniydi, qolgani tashlab yuboriladi. Natijada "Reels ishladimi yoki
--    Instagram bio ishladimi?" degan savolga javob yo'q — butun reklama
--    budjeti ko'r-ko'rona sarflanadi.
--
--    Yechim — BIRINCHI TEGINISH (first-touch) atributsiyasi:
--      users.source          — odam BIRINCHI marta qaysi havola bilan kelgani
--                              (keyin boshqa havola bilan kelsa HAM o'zgarmaydi;
--                              birinchi marta kim olib kelgani muhim).
--      users.source_first_at — o'sha birinchi teginish vaqti.
--      orders.source         — buyurtma yaratilganda users.source dan nusxa
--                              olinadi. Nusxa ataylab: foydalanuvchi qatori
--                              keyin o'zgarsa yoki o'chsa ham, o'tgan oyning
--                              hisoboti o'zgarmasligi kerak.
--
-- 2) To'plamlar (bundle). "CapCut + Canva" kabi paket sotish uchun bitta
--    buyurtmada 2-3 ta akkaunt yetkazilishi kerak. Buning uchun YANGI
--    yetkazish oqimi yozilmaydi: `order_items` + `processApprovedOrderDelivery`
--    allaqachon ko'p mahsulotli buyurtmani element-element yetkazadi
--    (savatcha shu orqali ishlaydi). To'plam checkout paytida tarkibiy
--    rejalarga "yoyiladi" va o'sha sinalgan oqimdan o'tadi.
--
--      plans.is_bundle    — bu reja to'plammi;
--      plan_bundle_items  — to'plam tarkibi (qaysi reja, nechta).
--
-- Fayl idempotent — ikki marta ishga tushirish xavfsiz.
-- Supabase → SQL Editor da ishga tushiring.
-- ============================================================

-- ---------- 1. MANBA ----------

alter table users  add column if not exists source text;
alter table users  add column if not exists source_first_at timestamptz;
alter table orders add column if not exists source text;

-- Partial indeks: manbasi yo'q qatorlar indeksda joy olmaydi (eski
-- foydalanuvchilarning hammasi NULL bo'ladi).
create index if not exists idx_users_source  on users(source)  where source is not null;
create index if not exists idx_orders_source on orders(source) where source is not null;

-- Manbalar lug'ati. Majburiy emas (kod lug'atda yo'q manbani ham yozadi),
-- lekin admin panelda "reels_03" o'rniga odam o'qiydigan nom ko'rsatish va
-- havola generatorida ro'yxat chiqarish uchun kerak.
create table if not exists traffic_sources (
  slug       text primary key,
  label      text,
  kind       text not null default 'other'
             check (kind in ('reels', 'instagram', 'telegram', 'chatla', 'web', 'other')),
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS: loyihadagi barcha jadvallar kabi yopiq (28_enable_rls.sql mantiqi).
-- Kod service_role bilan ishlaydi, u RLS ni chetlab o'tadi.
alter table traffic_sources enable row level security;

-- Boshlang'ich lug'at. ON CONFLICT DO NOTHING — adminning qo'lda
-- o'zgartirgan nomlarini qayta yozib ketmaydi.
insert into traffic_sources (slug, label, kind, note) values
  ('instagram_bio',    'Instagram bio havolasi',        'instagram', 'Profil bio''dagi doimiy havola'),
  ('instagram_story',  'Instagram story',               'instagram', 'Story''dagi sticker/havola'),
  ('telegram_channel', 'Telegram kanal (@santyx_pro)',  'telegram',  'Kanal postlaridagi havola'),
  ('chatla_dm',        'chatla.uz avto-DM',             'chatla',    'Izohga "PRO" yozganlarga ketgan DM'),
  ('website',          'Sayt (santyx.uz)',              'web',       'Saytdan botga o''tganlar'),
  ('reels_01', 'Reels #01', 'reels', null),
  ('reels_02', 'Reels #02', 'reels', null),
  ('reels_03', 'Reels #03', 'reels', null),
  ('reels_04', 'Reels #04', 'reels', null),
  ('reels_05', 'Reels #05', 'reels', null),
  ('reels_06', 'Reels #06', 'reels', null),
  ('reels_07', 'Reels #07', 'reels', null),
  ('reels_08', 'Reels #08', 'reels', null),
  ('reels_09', 'Reels #09', 'reels', null),
  ('reels_10', 'Reels #10', 'reels', null),
  ('reels_11', 'Reels #11', 'reels', null),
  ('reels_12', 'Reels #12', 'reels', null)
on conflict (slug) do nothing;

-- ---------- 2. TO'PLAMLAR ----------

alter table plans add column if not exists is_bundle boolean not null default false;

create table if not exists plan_bundle_items (
  id             uuid primary key default gen_random_uuid(),
  bundle_plan_id uuid not null references plans(id) on delete cascade,
  -- on delete restrict: to'plam tarkibidagi reja o'chirilib ketsa to'plam
  -- "yarim" bo'lib qolardi va yetkazishda jim buziladi. Avval tarkibdan
  -- chiqarish kerak.
  child_plan_id  uuid not null references plans(id) on delete restrict,
  quantity       integer not null default 1 check (quantity > 0),
  sort_order     integer not null default 1,
  created_at     timestamptz not null default now(),
  unique (bundle_plan_id, child_plan_id),
  -- To'plam o'z-o'zini o'z ichiga olmaydi.
  constraint plan_bundle_items_no_self check (bundle_plan_id <> child_plan_id)
);

create index if not exists idx_plan_bundle_items_bundle on plan_bundle_items(bundle_plan_id, sort_order);
create index if not exists idx_plan_bundle_items_child  on plan_bundle_items(child_plan_id);

alter table plan_bundle_items enable row level security;

-- Ikki pog'onali to'plam (to'plam ichida to'plam) yetkazishda cheksiz
-- rekursiyaga olib kelardi — kodda ham, bazada ham bitta pog'ona.
create or replace function assert_bundle_child_is_not_bundle() returns trigger as $$
begin
  if exists (select 1 from plans where id = new.child_plan_id and is_bundle = true) then
    raise exception 'To''plam ichiga boshqa to''plam qo''shib bo''lmaydi (child_plan_id=%)', new.child_plan_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_plan_bundle_items_no_nesting on plan_bundle_items;
create trigger trg_plan_bundle_items_no_nesting
  before insert or update on plan_bundle_items
  for each row execute function assert_bundle_child_is_not_bundle();
