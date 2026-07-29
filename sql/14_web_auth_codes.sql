-- Brauzer orqali Telegram login: bir martalik 6 xonali tasdiqlash kodlari.
-- Bot /start web_login da kod yaratadi (5 daqiqa amal qiladi), brauzer uni tekshiradi.

CREATE TABLE IF NOT EXISTS web_auth_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_auth_codes_code ON web_auth_codes (code) WHERE used = FALSE;
CREATE INDEX IF NOT EXISTS idx_web_auth_codes_tg ON web_auth_codes (telegram_id);
