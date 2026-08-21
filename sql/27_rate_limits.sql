-- ============================================================
-- Umumiy chastota chegarasi (rate limiting) jadvali.
-- Ochiq (autentifikatsiyasiz) so'rovlarni brute-force va spamdan himoya qiladi:
--   scope='web_code'   — brauzer orqali kirish kodini tekshirish urinishlari
--   scope='lead'       — saytdagi "so'rov qoldirish" formasi
-- Kalit odatda mijoz IP manzili bo'ladi.
--
-- Bu jadval yaratilmasa kod ishlashda davom etadi (chegara o'chiq holatda),
-- lekin funksiya loglarida ogohlantirish chiqadi.
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, key)
);

-- Eskirgan yozuvlarni tozalash uchun (maintenance vazifasi foydalanadi)
CREATE INDEX IF NOT EXISTS idx_rate_limits_stale ON rate_limits (updated_at);
