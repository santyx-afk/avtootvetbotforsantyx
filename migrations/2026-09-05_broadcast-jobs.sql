-- 2026-09-05 — Broadcast navbati (admin panel "Xabar yuborish").
-- PR: claude/app-performance-analysis-j7vbo6 (admin panel yangilanishi)
--
-- Nima uchun: 1 200+ foydalanuvchiga xabar yuborish Netlify funksiyasining
-- 10 soniyalik chegarasiga sig'maydi. Endi yuborish ish (job) sifatida bazada
-- saqlanadi: background funksiya (15 daqiqagacha) yuboradi, uzilib qolsa
-- maintenance cron cursor'dan davom ettiradi. Shu jadval "Admin xabari"
-- oqimini ham saqlaydi: admin botga yuborgan xabar (matn, rasm, video, fayl)
-- copyMessage bilan hammaga nusxalanadi.
--
-- Idempotent — ikki marta ishga tushirilsa buzilmaydi.

create table if not exists broadcast_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'copy' check (kind in ('copy', 'text')),
  status text not null default 'awaiting_message'
    check (status in ('awaiting_message', 'awaiting_confirm', 'queued', 'sending', 'done', 'cancelled', 'failed')),
  segment text not null default 'all',
  admin_telegram_id text,
  from_chat_id text,          -- nusxa manbai: admin bilan chat
  message_id bigint,          -- nusxa manbai: xabar
  text text,                  -- matnli broadcast (panel formasi)
  prompt_chat_id text,        -- adminga ketgan "kutilyapti"/"tasdiqlang" xabari (tahrirlash uchun)
  prompt_message_id bigint,
  recipients jsonb not null default '[]'::jsonb,  -- telegram_id ro'yxati (segment bo'yicha)
  total integer not null default 0,
  cursor integer not null default 0,              -- nechtasi qayta ishlangan (davom etish nuqtasi)
  sent integer not null default 0,
  failed integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_broadcast_jobs_status on broadcast_jobs (status, updated_at);

-- Boshqa jadvallar kabi RLS yoqiq; service role kaliti o'qiydi/yozadi.
alter table broadcast_jobs enable row level security;
