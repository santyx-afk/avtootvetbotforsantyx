-- Humo avtomatlashtirilgan to'lov tizimi uchun checks jadvali
CREATE TABLE IF NOT EXISTS checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_code TEXT UNIQUE NOT NULL,
    order_id TEXT NOT NULL,
    original_amount NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    url TEXT NOT NULL,
    post JSONB,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- amount bo'yicha indeks (webhook tezroq qidirishi uchun)
CREATE INDEX IF NOT EXISTS idx_checks_amount ON checks(amount);
-- status bo'yicha indeks
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
-- check_code bo'yicha indeks
CREATE INDEX IF NOT EXISTS idx_checks_check_code ON checks(check_code);
