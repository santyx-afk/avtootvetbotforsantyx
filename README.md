 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index 82b9c7f29379b86cd23141d11b6c07c2a7bd49dd..b0307ae3ef9f4eed59c0c776bf76ac49a045e516 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,42 @@
 # avtootvetbotforsantyx
-jonga tegdi wibecoding ga ure
+
+Telegram shop bot (Telegraf + Express). Business logic saqlangan, deploy qismi Netlify webhook formatiga moslashtirilgan.
+
+## Architecture (current)
+- Framework: **Node.js + Telegraf**
+- Old runtime mode (Railway): **long polling** (`bot.launch()`)
+- Netlify runtime mode: **serverless webhook** (`netlify/functions/telegram-webhook.js`)
+- Storage/state: in-memory `Set` (users) va `isBroadcasting` flag (stateless emas, cold startda reset bo'ladi)
+
+## ENV variables
+Netlify Site settings → Environment variables ga quyidagilarni kiriting:
+- `BOT_TOKEN` (majburiy)
+- `ADMIN_ID` (ixtiyoriy, default: `1286053845`)
+
+## Local run (polling)
+```bash
+BOT_TOKEN=... ADMIN_ID=... npm start
+```
+
+## Netlify deploy
+1. Repo'ni Netlify bilan ulang.
+2. Build command: bo'sh qoldiring (`none`) yoki `npm install`.
+3. Publish directory: kerak emas (functions-only loyiha).
+4. ENV qo'shing: `BOT_TOKEN`, `ADMIN_ID`.
+5. Deploy qiling.
+
+Webhook URL formati:
+```text
+https://<your-netlify-site>.netlify.app/.netlify/functions/telegram-webhook
+```
+
+Telegram webhook set qilish:
+```bash
+curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
+  -d "url=https://<your-netlify-site>.netlify.app/.netlify/functions/telegram-webhook"
+```
+
+Webhook tekshirish:
+```bash
+curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
+```
 
EOF
)
