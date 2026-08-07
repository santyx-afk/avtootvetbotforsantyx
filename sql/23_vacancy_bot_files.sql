-- ============================================================
-- Vakansiya bot fayl almashinuvi
-- Mijoz isxodnik materiallarni botga yuboradi → bot montajorga uzatadi.
-- Montajor tayyor faylni botga yuboradi → bot mijozga uzatadi (yuklab olinadigan).
-- Do'kon jadvallariga tegmaydi.
-- ============================================================

-- Fayllar Supabase'ga yuklanmaydi: Telegram'dagi xabar manzili saqlanadi va
-- keyin copyMessage bilan ko'chiriladi. Shu sabab hajm cheklovi ham yo'q.
CREATE TABLE IF NOT EXISTS vacancy_pending_files (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES freelance_orders(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,          -- kim yubordi (telegram_id)
  tg_chat_id TEXT NOT NULL,         -- qaysi chatdan ko'chiriladi
  tg_message_id BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'material',  -- material | result
  forwarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vpf_order
  ON vacancy_pending_files(order_id, kind)
  WHERE forwarded = false;

-- Yakuniy fayl mijozga yuborilganini belgilash — takror yuborilmasin va
-- montajor keyingi fayllarini bot boshqa order'ga bog'lab yubormasin.
ALTER TABLE freelance_orders ADD COLUMN IF NOT EXISTS final_file_sent BOOLEAN DEFAULT false;
