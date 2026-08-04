-- ============================================================
-- Vakansiyalar (Freelance Marketplace) — schema
-- MUHIM MOSLASH: mavjud `users.telegram_id` TEXT (BIGINT emas), va loyihada
-- telegram id lar TEXT + FK'siz saqlanadi (wallet_transactions, referrals kabi).
-- Shuning uchun barcha telegram-id ustunlari TEXT, users ga qattiq FK yo'q
-- (index bilan). Ichki SERIAL FK lar (workers/listings/chats/orders) saqlangan.
-- Alohida modul — mavjud obuna do'koni jadvallariga tegmaydi.
-- ============================================================

-- Ishchilar (montajor/dizayner)
CREATE TABLE IF NOT EXISTS workers (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  bio TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',      -- ['montaj','dizayn']
  portfolio_urls TEXT[] DEFAULT '{}',           -- max 2 (Instagram, Telegram)
  show_phone BOOLEAN DEFAULT false,
  card_number TEXT,
  work_schedule JSONB DEFAULT '{}',
  is_busy BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT,
  banned_until TIMESTAMPTZ,                      -- vaqtincha ban (7 kun) uchun
  experience_years INTEGER DEFAULT 0,
  avg_rating NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  total_earnings INTEGER DEFAULT 0,
  deadline_violations INTEGER DEFAULT 0,
  rules_accepted BOOLEAN DEFAULT false,         -- qoidalar modali qabul qilindi
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id);
CREATE INDEX IF NOT EXISTS idx_workers_approved ON workers(is_approved) WHERE is_approved = true;

-- Ro'yxatdan o'tish tasdiqlash kodlari
CREATE TABLE IF NOT EXISTS worker_verification (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,                            -- 6 xonali
  user_id TEXT,
  status TEXT DEFAULT 'pending',                 -- pending, approved, rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);
CREATE INDEX IF NOT EXISTS idx_worker_verif_phone ON worker_verification(phone) WHERE status = 'pending';

-- E'lonlar
CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,                        -- 'montaj' | 'dizayn'
  min_price INTEGER NOT NULL,
  is_published BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listings_worker ON listings(worker_id);
CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(category) WHERE is_published = true AND is_hidden = false;

-- Suhbatlar
CREATE TABLE IF NOT EXISTS chats (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,                       -- mijoz telegram_id
  worker_user_id TEXT NOT NULL,                  -- ishchi telegram_id
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chats_client ON chats(client_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_worker ON chats(worker_user_id, last_message_at DESC);

-- Xabarlar
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',              -- text, image, video, system
  content TEXT,
  media_url TEXT,                                -- Supabase Storage yo'li (himoyalangan)
  media_thumbnail TEXT,
  reply_to_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
  is_reported BOOLEAN DEFAULT false,
  report_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, created_at);

-- Buyurtmalar
CREATE TABLE IF NOT EXISTS freelance_orders (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  client_id TEXT NOT NULL,
  worker_user_id TEXT NOT NULL,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  format TEXT,
  reference_urls TEXT[] DEFAULT '{}',
  notes TEXT,
  amount INTEGER NOT NULL,
  commission INTEGER NOT NULL DEFAULT 0,         -- 10%
  worker_amount INTEGER NOT NULL DEFAULT 0,
  deadline_hours NUMERIC NOT NULL,               -- 1..240
  deadline_at TIMESTAMPTZ,
  first_payment INTEGER DEFAULT 0,               -- 50%
  second_payment INTEGER DEFAULT 0,
  first_payment_status TEXT DEFAULT 'pending',   -- pending, paid
  second_payment_status TEXT DEFAULT 'pending',  -- pending, paid, refunded
  worker_paid BOOLEAN DEFAULT false,
  has_source_materials BOOLEAN DEFAULT false,
  source_materials_sent BOOLEAN DEFAULT false,
  result_media_url TEXT,
  revision_count INTEGER DEFAULT 0,              -- max 3
  counter_offer_count INTEGER DEFAULT 0,         -- max 3
  parent_order_id INTEGER REFERENCES freelance_orders(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'created',
  -- created, accepted, payment_pending, first_paid, materials_pending,
  -- in_progress, result_sent, reviewing, revising, final_payment_pending,
  -- completed, cancelled, disputed
  deadline_warning_sent BOOLEAN DEFAULT false,
  deadline_expired BOOLEAN DEFAULT false,
  unique_price INTEGER,                          -- HumoCardBot to'lov aniqlash uchun (savol #2)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forders_client ON freelance_orders(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forders_worker ON freelance_orders(worker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forders_status ON freelance_orders(status);

-- Baholar (ikki tomonlama)
CREATE TABLE IF NOT EXISTS freelance_reviews (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES freelance_orders(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  reviewed_id TEXT NOT NULL,
  reviewer_role TEXT NOT NULL,                   -- 'client' | 'worker'
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, reviewer_role)
);
CREATE INDEX IF NOT EXISTS idx_freviews_reviewed ON freelance_reviews(reviewed_id) WHERE is_visible = true;

-- Reportlar
CREATE TABLE IF NOT EXISTS freelance_reports (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES freelance_orders(id) ON DELETE SET NULL,
  chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',                 -- pending, reviewed, resolved
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_freports_status ON freelance_reports(status, created_at DESC);
