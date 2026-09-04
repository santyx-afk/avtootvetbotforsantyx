# SQL migratsiyalar

Bu papka ma'lumotlar bazasi sxemasi o'zgarishlarining **yagona tarixi**. Oldin
sxema o'zgarishlari hech qayerda qayd etilmasdi va shu sabab kod bilan baza
orasida nomuvofiqlik xatolari chiqqan (masalan, API qaytarmaydigan ustunga
frontend murojaat qilib krash bo'lgani). Endi tartib quyidagicha.

## Qoidalar

1. **Har bir sxema o'zgarishi — alohida fayl**, nomi:
   `YYYY-MM-DD_qisqa-tavsif.sql` (masalan, `2026-08-20_plans-tags-jsonb.sql`).
2. Fayl tepasida komment bo'lishi shart: sana, nima uchun kerak, qaysi PR ga
   tegishli.
3. Migratsiya **qo'lda ishga tushiriladi** — Supabase Dashboard → SQL Editor
   orqali, faqat loyiha egasi tomonidan. Avtomatik apply YO'Q va bo'lmaydi.
4. Ishga tushirilgach quyidagi jurnalga qator qo'shiladi.
5. Imkon qadar migratsiyalar **idempotent** yozilsin
   (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) — ikki marta ishga
   tushirilsa ham buzilmasin.

## Jurnal

| Fayl | Qo'llangan sana | Izoh |
|---|---|---|
| [BASELINE.md](BASELINE.md) | 2026-08-16 | Boshlang'ich snapshot — joriy 42 jadval holati |
| [2026-08-17_leads.sql](2026-08-17_leads.sql) | 2026-08-24 | Landing lead formasi uchun `leads` jadvali |
| [2026-08-24_promo-plans-and-balance.sql](2026-08-24_promo-plans-and-balance.sql) | 2026-08-24 | Promokodni tovarga bog'lash (`plan_ids`), xush kelibsiz bonusi (`welcome_bonus`, `welcome_bonus_at`) |
| [2026-08-24_credit-all-users.sql](2026-08-24_credit-all-users.sql) | 2026-08-24 | `credit_all_users()` — hamma balansini bittada to'ldirish (anon roldan huquq olib tashlangan) |
| [2026-08-24_drop-vacancy-tables.sql](2026-08-24_drop-vacancy-tables.sql) | ⚠️ **loyiha egasi ishga tushiradi** | Vakansiya jadvallarini o'chirish — ma'lumot yo'qoladi, avval zaxira oling |
| [2026-08-24_plan-slugs.sql](2026-08-24_plan-slugs.sql) | 2026-08-24 | Rejalarga URL nomi (`slug`) — ochiq mahsulot sahifalari uchun |
| [2026-09-04_perf-indexes.sql](2026-09-04_perf-indexes.sql) | 2026-09-04 | Mini App issiq yo'llari uchun indekslar (stok, savat, buyurtma) — xavfsiz, ma'lumot o'zgarmaydi |
| [2026-09-05_users-admin-note-tags.sql](2026-09-05_users-admin-note-tags.sql) | 2026-09-05 | Foydalanuvchi kartochkasi: `admin_note`, `tags` |
| [2026-09-05_broadcast-jobs.sql](2026-09-05_broadcast-jobs.sql) | 2026-09-05 | `broadcast_jobs` — admin xabari (bot orqali nusxa) va matnli broadcast navbati |

## BASELINE.md haqida

`BASELINE.md` — migratsiyalar boshlangan paytdagi bazaning to'liq holati
(barcha jadvallar, ustunlar, turlari, PK/FK). Yangi migratsiyalar shu nuqtadan
hisoblanadi. Vaqti-vaqti bilan (masalan, har 10-15 migratsiyadan keyin) uni
qayta generatsiya qilib yangilash mumkin.

Muhim eslatma: bazada kod ishlatmaydigan "meros" ustunlar bor (masalan,
`workers` jadvalidagi `avg_rating`, `total_reviews` — reyting tizimi olib
tashlanganidan qolgan). Frontend uchun haqiqat manbai — API'ning shape
funksiyalari (`vacancy-api.js`, `webapp-api.js`), baza sxemasi emas.
