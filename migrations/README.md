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

## BASELINE.md haqida

`BASELINE.md` — migratsiyalar boshlangan paytdagi bazaning to'liq holati
(barcha jadvallar, ustunlar, turlari, PK/FK). Yangi migratsiyalar shu nuqtadan
hisoblanadi. Vaqti-vaqti bilan (masalan, har 10-15 migratsiyadan keyin) uni
qayta generatsiya qilib yangilash mumkin.

Muhim eslatma: bazada kod ishlatmaydigan "meros" ustunlar bor (masalan,
`workers` jadvalidagi `avg_rating`, `total_reviews` — reyting tizimi olib
tashlanganidan qolgan). Frontend uchun haqiqat manbai — API'ning shape
funksiyalari (`vacancy-api.js`, `webapp-api.js`), baza sxemasi emas.
