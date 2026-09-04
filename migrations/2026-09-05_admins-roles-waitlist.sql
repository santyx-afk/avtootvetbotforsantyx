-- 2026-09-05 — Admin rollari (egasi / operator) va stok waitlist.
-- PR: claude/app-performance-analysis-j7vbo6 (admin panel yangilanishi)
--
-- admins: operatorlar login + parol (scrypt hash) bilan kiradi. Egasi
--   avvalgidek ADMIN_PASSWORD (env) bilan kiradi, jadvalga yozilmaydi.
--   Operator: buyurtma tasdiqlash/rad etish, qo'lda yetkazish, inventar
--   qo'shish, leadlar, sharhlar. Pul, sozlamalar, promokod, kredensiallarni
--   ochish — faqat egasi (server tomonda tekshiriladi, shared/auth.js).
-- stock_waitlist: "Kelganda xabar ber" — bitta foydalanuvchi bitta reja
--   uchun bir marta (unique), xabar ketgach notified = true.
--
-- Idempotent — ikki marta ishga tushirilsa buzilmaydi.

alter table admins add column if not exists password_hash text;
alter table admins add column if not exists role text not null default 'operator';
alter table admins add column if not exists is_active boolean not null default true;
alter table admins add column if not exists last_login_at timestamptz;
alter table admins drop constraint if exists admins_role_check;
alter table admins add constraint admins_role_check check (role in ('owner', 'operator'));
create unique index if not exists idx_admins_username on admins (lower(username));

create unique index if not exists idx_stock_waitlist_user_plan on stock_waitlist (user_telegram_id, plan_id);
create index if not exists idx_stock_waitlist_plan on stock_waitlist (plan_id) where notified = false;
alter table stock_waitlist enable row level security;
