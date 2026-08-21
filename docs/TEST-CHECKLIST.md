# Mini App — Test Checklist (Faza 7)

Bu ro'yxat Mini App'ni Telegramda ishga tushirishdan oldin qo'lda tekshirish uchun.
Har bir qatorni bajarilganda ✅ belgilang.

---

## 0. Deploy oldidan tayyorgarlik (majburiy)

- [ ] **SQL migratsiyalar** ishga tushirilgan (Supabase SQL Editor'da tartib bilan):
  - `sql/06_webapp_users.sql`
  - `sql/07_webapp_catalog.sql`
  - `sql/08_webapp_profile.sql`
  - `sql/09_webapp_wishlist.sql`
  - `sql/10_admin_panel.sql`
- [ ] **Supabase Storage** da `product-images` nomli **public** bucket yaratilgan
- [ ] **Muhit o'zgaruvchilari** (Netlify → Site settings → Environment variables):
  - [ ] `ADMIN_PASSWORD` — o'rnatilgan (aks holda admin panelga kira olmaysiz!)
  - [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
  - [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - [ ] `VITE_SUPPORT_USERNAME`, `VITE_BOT_USERNAME`
  - [ ] `APP_BASE_URL` — deploy qilingan sayt URL'i
- [ ] **BotFather menu button** — Mini App URL'iga sozlangan
  (BotFather → /mybots → bot → Bot Settings → Menu Button → URL kiriting)

---

## 1. Kirish oqimi (Onboarding + Contact)

- [ ] Birinchi ochilishda **onboarding** slaydlari ko'rinadi
- [ ] Onboarding tugagach **kontakt so'rash** ekrani chiqadi
- [ ] Kontakt ulashilgach katalogga o'tadi
- [ ] Ikkinchi marta ochilganda onboarding/kontakt **qayta so'ralmaydi**
- [ ] Bloklangan foydalanuvchida **"Hisobingiz bloklangan"** ekrani chiqadi

## 2. Katalog

- [ ] Mahsulotlar yuklanguncha **skeleton** ko'rinadi
- [ ] Bannerlar aylanadi (agar bannerlar bo'lsa)
- [ ] Qidiruv ishlaydi (mahsulot nomi bo'yicha)
- [ ] Kategoriya chiplari filtrlaydi
- [ ] Saralash (narx ↑/↓, ommabop) ishlaydi
- [ ] "Yaqinda ko'rilganlar" ko'rinadi (mahsulot ochgandan keyin)
- [ ] Wishlist tugmasi ishlaydi (yurak to'ladi/bo'shaydi)
- [ ] Savatga qo'shish ishlaydi
- [ ] Internet uzilsa **error + qayta urinish** ko'rinadi

## 3. Mahsulot batafsil

- [ ] Rasm (yoki placeholder) ko'rinadi
- [ ] Narx, chegirma %, tejaш, muddat to'g'ri
- [ ] Reyting yulduzlari va sharhlar ko'rinadi
- [ ] Sharh qo'shish ishlaydi
- [ ] Miqdor stepper (1–5) ishlaydi
- [ ] Savatga qo'shilganda "✓ Qo'shildi" chiqadi
- [ ] Stok tugagan mahsulotda tugma "Tugagan" bo'ladi
- [ ] Ulashish tugmasi ishlaydi

## 4. Savat

- [ ] Elementlar, narxlar, tejagan summa to'g'ri
- [ ] Miqdor o'zgartirish va o'chirish ishlaydi
- [ ] Tab'dagi savat **badge** soni to'g'ri
- [ ] Bo'sh savatda tegishli holat ko'rinadi
- [ ] "Rasmiylashtirish" checkout'ga o'tadi

## 5. Checkout (to'lov)

- [ ] Buyurtma xulosasi to'g'ri
- [ ] Balans toggle ishlaydi (balans bor bo'lsa)
- [ ] Promokod tekshiruvi ishlaydi (to'g'ri/xato)
- [ ] Qoidalarga rozilik checkbox majburiy
- [ ] To'lov fazasida **taymer** sanaydi
- [ ] Summa va karta raqami **nusxa** olinadi
- [ ] To'lovdan keyin natija (kredensiallar / kutish / muddat tugadi) to'g'ri
- [ ] Muvaffaqiyatda **haptik** javob keladi

## 6. Balans to'ldirish (TopUp)

- [ ] Summa kiritish + tez tanlash tugmalari
- [ ] Cashback preview to'g'ri hisoblanadi
- [ ] Min summa cheklovi ishlaydi
- [ ] To'lov + natija oqimi ishlaydi

## 7. Tarix

- [ ] Buyurtmalar ro'yxati, status chiplari to'g'ri
- [ ] Obuna muddati ko'rinadi
- [ ] Bo'sh holatda tegishli xabar

## 8. Wishlist

- [ ] Barcha saqlangan mahsulotlar (stok tugaganlar ham) ko'rinadi
- [ ] O'chirish ishlaydi
- [ ] Narx tushgan mahsulotda belgi ko'rinadi

## 9. Profil

- [ ] Foydalanuvchi ma'lumoti, balans to'g'ri
- [ ] Balans tarixi (tranzaksiyalar)
- [ ] Faol obunalar, ≤3 kun ogohlantirish
- [ ] Referal havola + statistika + ulashish
- [ ] FAQ akkordeoni ochiladi/yopiladi
- [ ] Til almashtirish ishlaydi
- [ ] Support havolasi ochiladi

---

## 10. Tillar (uz / ru / en)

Har bir tilda katalog, mahsulot, savat, checkout, profil sahifalarini ko'zdan kechiring:

- [ ] **O'zbekcha** — barcha matnlar to'g'ri, kesilmagan
- [ ] **Ruscha** — barcha matnlar to'g'ri, kesilmagan
- [ ] **Inglizcha** — barcha matnlar to'g'ri, kesilmagan
- [ ] Til almashtirilganda kontent darhol yangilanadi

> Kod tekshiruvi: barcha 173 ta tarjima kaliti 3 tilda ham mavjud (avtomatik tekshirildi ✅)

## 11. Tema (dark / light)

- [ ] **Light** temada ranglar, kontrast yaxshi
- [ ] **Dark** temada ranglar, kontrast yaxshi
- [ ] Telegram tema o'zgarganda ilova darhol moslashadi
- [ ] Header/fon rangi sahifa foniga mos

## 12. Responsive (turli qurilmalar)

- [ ] Kichik ekran (iPhone SE / ~360px) — hammasi sig'adi, gorizontal skroll yo'q
- [ ] Katta telefon (iPhone Pro Max / Android) — grid, tugmalar joyida
- [ ] Sticky panellar (savat/checkout tugmasi, action bar) to'g'ri
- [ ] Safe-area (notch, pastki chiziq) hisobga olingan

## 13. Animatsiya va haptik

- [ ] Sahifalar ochilganda yengil **fade/slide** animatsiya
- [ ] Tugmalar bosilganda **press** effekti
- [ ] Tab almashganda, savat/wishlist amalida **haptik** javob
- [ ] Qurilma "reduce motion" yoqilганda animatsiyalar o'chadi

---

## 14. Admin panel

- [ ] `ADMIN_PASSWORD` bilan kirish; noto'g'ri parol rad etiladi
- [ ] Eski hardcoded parollar (admin123 va h.k.) **ishlamaydi**
- [ ] Dashboard: statistika + tushum grafigi (Chart.js)
- [ ] Kategoriya / Reja CRUD; rejaga **rasm yuklash** ishlaydi
- [ ] Bannerlar / FAQ CRUD; tartib (↑/↓) ishlaydi
- [ ] Sharhlar: tasdiqlash / rad etish / o'chirish
- [ ] Foydalanuvchilar: qidiruv, **block / unblock**
- [ ] Xabar yuborish: individual + broadcast
- [ ] Buyurtmalar: approve / reject / retry / complete + **CSV export**
- [ ] Sozlamalar: karta, cashback, referal, min topup saqlanadi

## 15. Bot integratsiyasi

- [ ] Menu button orqali Mini App ochiladi
- [ ] Eski inline katalog oqimi ham ishlab turadi (zaxira)
- [ ] Reja narxi tushirilганda wishlistdagilarga **bot xabari** keladi
- [ ] Referal birinchi xaridida referrerga **bonus** tushadi
- [ ] Har xaridda referrerga **foizli bonus** tushadi
- [ ] Bloklangan foydalanuvchi botda ham to'silgan

---

### Eslatma
Bu muhitda (headless) haqiqiy qurilma/Telegram testi o'tkazib bo'lmaydi.
Kod va build darajasidagi tekshiruvlar bajarildi:
- ✅ `npm run build` muvaffaqiyatli
- ✅ Barcha backend modullar yuklanadi
- ✅ 173 ta tarjima kaliti 3 tilda to'liq
