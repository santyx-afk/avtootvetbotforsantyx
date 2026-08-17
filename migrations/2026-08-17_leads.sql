-- 2026-08-17 · Lead yig'ish jadvali
-- Sabab: landing sahifasidagi "Izlagan obunangiz yo'qmi?" formasi orqali
-- kelgan so'rovlar shu yerga yoziladi (admin panel "Leadlar" bo'limi +
-- adminga bot orqali xabar boradi).
-- Idempotent: ikki marta ishga tushirilsa ham buzilmaydi.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  wanted text not null,          -- qaysi obuna/xizmat izlanyapti
  contact text not null,         -- @username yoki telefon
  name text,                     -- ixtiyoriy ism
  status text not null default 'new',  -- new | done
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

create index if not exists leads_status_created_idx
  on public.leads (status, created_at desc);
