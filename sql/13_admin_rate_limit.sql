-- Admin panelga brute-force himoyasi: login urinishlarini IP bo'yicha kuzatish.
-- 5 ta noto'g'ri urinishdan keyin IP 10 daqiqaga bloklanadi (kod tomonida).

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
