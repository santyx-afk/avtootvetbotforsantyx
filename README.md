# Telegram Subscription Sales Bot

Production-ready Telegram subscription sales bot with a simple admin panel, built for Netlify Functions and Supabase.

## What this project does

This project helps a subscription seller automate Telegram conversations for products like CapCut Pro, Canva Pro, and other digital subscriptions.

### Customer side
- `/start` opens a welcome message in Uzbek.
- Customers browse categories with **inline keyboard** buttons.
- They open plans and variants, then view:
  - name
  - price
  - duration
  - warranty text
  - short description
- Each plan screen includes inline buttons for:
  - `Qanday ulanadi`
  - `To‘lov qilish`
  - `Orqaga`
- Payment receipts sent as text/photo/document are forwarded to admin Telegram chat with metadata.

### Admin side
- Password-protected admin panel hosted from the Netlify publish folder.
- Manage categories, plans, variants, ordering, and settings.
- View dashboard metrics such as total users, clicks, payment opens, most viewed categories/plans, and recent event logs.

## Mini App (React + Vite)

The customer-facing **Telegram Mini App** lives in `src/` and is built with React +
Vite. It is a subscription store with a bottom tab bar (Catalog, Cart, Wishlist,
History, Profile), Telegram-native theming (auto dark/light), 3 languages
(Uzbek / Russian / English), onboarding slides, and phone-number onboarding.

See `mini-app-rebuild-plan.md` for the full phased plan. **Phase 1 (skeleton)** is
implemented: project setup, Telegram WebApp SDK integration (theme, back button,
haptics, initData), routing, Supabase client, i18n, localStorage helpers, skeleton
loaders, error boundary + retry, onboarding, and contact (phone) capture.

### Structure

```text
index.html              Vite entry (loads Telegram WebApp SDK)
vite.config.mjs         Vite config (builds to dist/)
src/
  main.jsx              App bootstrap + providers
  App.jsx               Gates (onboarding, contact) + routes
  telegram/             WebApp SDK wrapper + provider (theme, haptics, back button)
  i18n/                 uz / ru / en translations + provider
  lib/                  Supabase client + webapp-api fetch wrapper
  utils/                localStorage + formatting helpers
  components/           TabBar, Skeleton, Onboarding, ContactGate, ...
  pages/               Catalog, Cart, Wishlist, History, Profile
  styles/global.css    Theme variables + base styles
netlify/functions/
  webapp-api.js         Mini App API (initData-validated: init, save-contact)
shared/webapp-auth.js   Telegram initData HMAC validation
```

### Build & deploy

`npm run build` runs `vite build` (output: `dist/`) then copies the static admin
panel into `dist/admin/`. Netlify serves the Mini App at `/`, the admin panel at
`/admin`, and functions via `/api/*`.

- Mini App dev server: `npm run dev` (Vite on port 5173)
- Full stack (functions + app): `npm run dev:netlify`

### Extra environment variables

Build-time (exposed to the browser — public values only):

- ~~`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`~~ — no longer used. The browser
  Supabase client was removed; all data goes through Netlify Functions.
- `VITE_API_BASE` — API base path (default `/api`)
- `VITE_SUPPORT_USERNAME`, `VITE_BOT_USERNAME`

Run `sql/06_webapp_users.sql` to add the `phone`, `birthday`, `photo_url`, and
`webapp_lang` columns used by the Mini App.

## Architecture plan

### Stack choice
The simplest Netlify-compatible stack used here is:
- **JavaScript** for lower setup friction.
- **Netlify Functions** for webhook and admin API.
- **Static admin panel** with vanilla HTML/CSS/JS for fast deployment.
- **Supabase Postgres** as a lightweight hosted database that works well in serverless environments.

### Project structure

```text
admin/
  index.html
  styles.css
  app.js
netlify/functions/
  telegram-webhook.js
  set-webhook.js
  admin-login.js
  admin-logout.js
  admin-session.js
  admin-dashboard.js
  admin-data.js
  admin-settings.js
shared/
  auth.js
  bot-service.js
  config.js
  db.js
  messages.js
  seed.js
sql/
  schema.sql
scripts/
  seed-demo.js
.env.example
netlify.toml
package.json
README.md
```

## How to install locally

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
cp .env.example .env
```

3. Fill the environment variables.

4. Start Netlify local development:

```bash
npx netlify dev
```

Admin panel will be available on the local Netlify URL, usually:

```text
http://localhost:8888
```

## Environment variables

Create these variables in `.env` locally and in Netlify Site settings for production.

### Required
- `TELEGRAM_BOT_TOKEN` — Telegram bot token from BotFather.
- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — service role key for Netlify Functions.
- `APP_BASE_URL` — public site URL, e.g. `https://your-site.netlify.app`.
- `SESSION_SECRET` — long random string (min 16 chars) for admin session signing.
- `ADMIN_PASSWORD` — admin panel login password.

> **`SESSION_SECRET` has no fallback.** It used to default to a hard-coded
> `'dev-secret'`, which — in a public repository — let anyone forge an admin
> session cookie. The fallback is gone: if the variable is missing, admin login
> returns a 500 and no session is ever accepted. Same for `WEB_JWT_SECRET`
> below, which falls back only to `TELEGRAM_BOT_TOKEN` (also secret).

### Recommended
- `TELEGRAM_WEBHOOK_SECRET` — secret token validated on Telegram webhook requests.
- `WEB_JWT_SECRET` — signing key for browser login tokens. Falls back to
  `TELEGRAM_BOT_TOKEN` if unset; set it explicitly so rotating the bot token
  does not log every web user out.
- `ADMIN_TELEGRAM_ID` — fallback admin Telegram chat/user ID.
- `PAYMENT_NOTIFIER_ID` — Telegram ID of the business account that forwards
  payment notifications (defaults to the historical hard-coded value).

`SUPABASE_ANON_KEY` is no longer used anywhere — the browser never talks to
Supabase directly, everything goes through Netlify Functions with the service
role key.

## Database setup

Use Supabase SQL editor and run the files in `sql/` in order:

```sql
-- sql/schema.sql            base schema
-- sql/02_*.sql … sql/26_*.sql   run in filename order
```

Every file is idempotent, so re-running them on an existing database is safe.

### Security migrations — run these

Three migrations are **not optional** if you care about the security posture:

| File | What it does | Notes |
|---|---|---|
| `sql/27_rate_limits.sql` | Creates the `rate_limits` table used to throttle login-code guessing and lead spam. | Without it the limiter fails open (logs a warning) and only the 8-digit code length protects the login flow. |
| `sql/28_enable_rls.sql` | Enables Row Level Security on **every** public table. | Does not break anything: all access goes through the service role, which bypasses RLS. It closes the anon key as an attack path. |
| `sql/29_drop_orphan_tables.sql` | Drops leftover tables from the removed chat / freelance-order / rating features. | **Take a backup first** — these may still hold old user data. |

> **Netlify env vars are required at runtime.** The functions call
> `getAdminClient()` on the very first line, so if `SUPABASE_URL` or
> `SUPABASE_SERVICE_ROLE_KEY` are missing (or not scoped to *Functions*),
> **every** function — the Telegram webhook included —
> fails immediately. In Netlify: *Site configuration → Environment variables*,
> make sure both are set and their scope includes **Functions**, then redeploy.

Then seed demo content:

```bash
npm run seed:demo
```

Demo content includes:
- Category: CapCut
- Plan: CapCut Keen
- Plan: CapCut Pro
- Variant: Browser-based CapCut Pro
- Variant: 6-month CapCut Pro
- Example price: `45,000 UZS`

## How to connect Telegram bot webhook

### Option 1: Netlify function
After deployment, open:

```text
https://your-site.netlify.app/api/set-webhook
```

This calls Telegram `setWebhook` using:

```text
https://your-site.netlify.app/.netlify/functions/telegram-webhook
```

### Option 2: Manual curl

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-site.netlify.app/.netlify/functions/telegram-webhook",
    "secret_token": "YOUR_TELEGRAM_WEBHOOK_SECRET",
    "allowed_updates": ["message", "callback_query"]
  }'
```

## How to deploy to Netlify

1. Push the repository to GitHub.
2. In Netlify, create a new site from Git.
3. Select this repository.
4. Build settings:
   - **Build command:** `echo 'Static admin + functions ready'`
   - **Publish directory:** `admin`
   - **Functions directory:** `netlify/functions`
5. Add all environment variables from `.env.example`.
6. Deploy the site.
7. Run Supabase schema SQL.
8. Seed demo data with `npm run seed:demo` locally or via your preferred workflow.
9. Open `/api/set-webhook` once to register the Telegram webhook.

## How to access admin panel

- Open your site root URL, for example:

```text
https://your-site.netlify.app
```

- Enter the password from `ADMIN_PASSWORD`.
- The session is stored in a secure cookie.

## How to add categories and plans

### Categories
1. Open **Kategoriyalar**.
2. Click **Yangi kategoriya**.
3. Fill name, slug, button label, order, and description.
4. Save.

### Plans and variants
1. Open **Rejalar**.
2. Click **Yangi reja**.
3. Select category.
4. For a variant, set **Ota reja** to an existing plan.
5. Fill price, duration, warranty, `Qanday ulanadi`, and payment instructions.
6. Save.

## Receipt forwarding flow

When a user opens a plan payment page and then sends a text/photo/document:
- the bot reads the last selected category and plan from `user_states`
- the receipt is copied to the admin Telegram chat
- metadata is attached:
  - customer name
  - username
  - Telegram user ID
  - selected category
  - selected plan
  - timestamp
- an analytics event `receipt_sent` is stored
- a record is saved in `receipt_submissions`

The bot does **not** ask customers to submit unsafe full financial data.

## Bot behavior and tradeoffs

### Implemented behavior
- Webhook-only Telegram handling.
- Inline keyboard navigation only for primary UX.
- Back navigation supported.
- Unsupported or malformed updates are safely ignored.
- Handler returns HTTP 200 even when update payload is malformed.
- Callback data parsing is protected from crashes.

### Tradeoffs
- Admin auth is intentionally simple: password + signed cookie via Netlify Functions.
- For larger teams, you may later replace it with Supabase Auth.
- Analytics aggregation is computed server-side in a simple way for maintainability.

## Owner Guide (Uzbek)

### Narxni qanday o‘zgartirish mumkin?
1. Admin panelga kiring.
2. `Rejalar` bo‘limiga o‘ting.
3. Kerakli tarifni `Edit` qiling.
4. `Narx` maydonini yangilang va saqlang.

### Yangi obuna qanday qo‘shiladi?
1. Avval `Kategoriyalar` bo‘limida yangi kategoriya yarating.
2. Keyin `Rejalar` bo‘limida shu kategoriyaga yangi tarif qo‘shing.
3. Agar variant kerak bo‘lsa, `Ota reja` ni tanlang.

### Eski obunani qanday o‘chirish mumkin?
1. `Kategoriyalar` yoki `Rejalar` bo‘limiga o‘ting.
2. Kerakli element yonidagi `Delete` tugmasini bosing.
3. Tasdiqlang.

### Statistikani qayerdan ko‘rish mumkin?
1. `Dashboard` bo‘limiga o‘ting.
2. U yerda foydalanuvchilar soni, kliklar, to‘lov sahifasi ochilishlari va eng ko‘p ko‘rilgan bo‘limlar chiqadi.

### To‘lov kartasi ma’lumotini qanday yangilash mumkin?
1. `Sozlamalar` bo‘limiga o‘ting.
2. `Karta raqami` va `Sotuvchi nomi` maydonlarini yangilang.
3. `Saqlash` tugmasini bosing.

## Summary of created files

- `admin/` — admin web interface.
- `netlify/functions/` — Telegram webhook and admin API.
- `shared/` — reusable business logic, Telegram API, DB helpers, auth, seed logic.
- `sql/` — Supabase/Postgres schema and migrations, applied in filename order.
- `scripts/seed-demo.js` — demo data seeder.
- `.env.example` — required environment variables.
- `netlify.toml` — Netlify configuration.
