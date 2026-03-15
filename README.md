# avtootvetbotforsantyx

Telegram shop bot (Telegraf + Express).

## Nega bot ishlamagan?
Oldingi holatda `bot.js` va `README.md` fayllariga tasodifan `git diff` matni yozilib qolgan edi. Shu sabab `bot.js` JavaScript sifatida parse bo'lmay, bot ishga tushmas edi.

## Arxitektura
- `bot.js` — bot logikasi (menu, mahsulotlar, admin buyruqlar).
- `server.js` — local run uchun Express + polling.
- `netlify/functions/telegram-webhook.js` — Netlify webhook handler.

## ENV
- `BOT_TOKEN` — majburiy.
- `ADMIN_ID` — ixtiyoriy (default: `1286053845`).

## Local ishga tushirish
```bash
npm install
BOT_TOKEN=... ADMIN_ID=... npm start
```

## Netlify webhook URL
```text
https://<your-site>.netlify.app/.netlify/functions/telegram-webhook
```

Telegram webhook o'rnatish:
```bash
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://<your-site>.netlify.app/.netlify/functions/telegram-webhook"
```# avtootvetbotforsantyx

Telegram shop bot (Telegraf + Express).

## Nega bot ishlamagan?
Oldingi holatda `bot.js` va `README.md` fayllariga tasodifan `git diff` matni yozilib qolgan edi. Shu sabab `bot.js` JavaScript sifatida parse bo'lmay, bot ishga tushmas edi.

## Arxitektura
- `bot.js` — bot logikasi (menu, mahsulotlar, admin buyruqlar).
- `server.js` — local run uchun Express + polling.
- `netlify/functions/telegram-webhook.js` — Netlify webhook handler.

## ENV
- `BOT_TOKEN` — majburiy.
- `ADMIN_ID` — ixtiyoriy (default: `1286053845`).

## Local ishga tushirish
```bash
npm install
BOT_TOKEN=... ADMIN_ID=... npm start
```

## Netlify webhook URL
```text
https://<your-site>.netlify.app/.netlify/functions/telegram-webhook
```

Telegram webhook o'rnatish:
```bash
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=https://<your-site>.netlify.app/.netlify/functions/telegram-webhook"
```
