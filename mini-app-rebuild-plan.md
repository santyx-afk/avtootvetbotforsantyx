# 🛒 @santyxnarxbot Mini App — Qayta Qurish Plani

## Umumiy Ma'lumot

| Parametr | Qiymat |
|----------|--------|
| Loyiha | Telegram Mini App — obuna do'koni |
| Bot | @santyxnarxbot (avtootvetbotforsantyx) |
| Stack | React + Vite |
| Backend | Netlify Serverless Functions |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage (logolar, bannerlar) |
| Deploy | Netlify (Proteam) |
| Dizayn | Telegram native UI — temaga avtomatik moslashuvchi (dark/light) |
| Tillar | O'zbek, Rus, Ingliz (profildan tanlanadi) |
| URL | https://avtootvetbotforsantyx.netlify.app |

---

## Navigatsiya Tuzilishi

**Pastki tab bar (bottom tabs):**

| Tab | Sahifa | Tavsif |
|-----|--------|--------|
| 🏠 Katalog | `/catalog` | Obunalar ro'yxati, qidiruv, filtrlash |
| 🛒 Savat | `/cart` | Tanlangan obunalar, checkout |
| ❤️ Wishlist | `/wishlist` | Yoqtirganlar ro'yxati |
| 📋 Tarix | `/history` | Buyurtmalar va obuna tarixi |
| 👤 Profil | `/profile` | Shaxsiy ma'lumotlar, sozlamalar |

---

## Faza 1 — Asos (Skeleton)

**Maqsad:** Loyiha tuzilishi, routing, auth, Telegram SDK

### Vazifalar:
1. Vite + React loyiha yaratish
2. Telegram WebApp SDK integratsiya:
   - `window.Telegram.WebApp` orqali tema ranglari
   - Back button boshqaruvi
   - Haptic feedback (tugmalar uchun)
   - `initData` dan user ma'lumotlarini olish (telegram_id, ism, tug'ilgan kun)
3. React Router — sahifalar orasida navigatsiya (minimal page transition animatsiya)
4. Supabase client ulanishi
5. Bottom tab bar komponenti
6. i18n (ko'p tillilik) tizimi — 3 til
7. LocalStorage yordamchi funksiyalar (til, onboarding, savat, oxirgi ko'rilganlar)
8. Skeleton loading komponenti
9. Error sahifasi + qayta urinish tugmasi
10. Birinchi ochilishda: telefon raqam so'rash → Supabase da saqlash
11. Onboarding slidelar (4-5 ta, skip tugmasi bilan) — faqat birinchi marta ko'rsatiladi

---

## Faza 2 — Katalog

**Maqsad:** Obunalarni ko'rsatish, qidirish, saralash

### Sahifa: Katalog (`/catalog`)
- **Tepada:** admin tomonidan boshqariladigan banner (rasm + link, muddati tugasa yo'qoladi)
- **Qidiruv:** matn kiritish maydoni
- **Kategoriyalar:** nomlari bilan bo'limlar (masalan: "Video tahrirlash", "Dizayn", "AI")
- **Obuna kartochkalari:**
  - Logo/rasm (Supabase Storage dan)
  - Nomi
  - Narxi (chegirmali bo'lsa: ~~eski narx~~ yangi narx, -20% badge)
  - Yulduz reytingi (o'rtacha baho)
  - "Ommabop" badge (mashhur obunalarga)
  - ❤️ wishlist tugmasi
  - 🛒 savatga qo'shish tugmasi
- **Saralash:** narx bo'yicha (arzon/qimmat) + mashhurlik bo'yicha
- **Yashirish:** mavjud bo'lmagan (stock = 0) obunalar ko'rsatilmaydi
- **Oxirgi ko'rilganlar:** localStorage da saqlanadi

### Sahifa: Obuna Batafsil (`/catalog/:id`)
- Logo/rasm
- Nomi
- Narxi + ofitsial narx (tejalgan pul ko'rsatiladi)
- Muddat (database dan, har bir obunaga individual)
- Qisqa tavsif
- Qoidalar (umumiy + obunaga alohida, admin paneldan boshqariladi)
- Sharhlar (matnli, yulduzli baho)
  - Sharh yozish formasi
  - Sharhlar avtomatik chiqadi (admin o'chirishi mumkin)
- Savatga qo'shish (1 tadan 5 tagacha)
- Share tugmasi (Telegram openTelegramLink)
- Wishlist tugmasi

---

## Faza 3 — Savat va Checkout

**Maqsad:** Bir nechta obunani birga sotib olish

### Sahifa: Savat (`/cart`)
- Tanlangan obunalar ro'yxati (har birining narxi)
- Miqdorni o'zgartirish (1-5 ta)
- O'chirish tugmasi
- **Narxlar ko'rinishi:**
  - Har bir obunaning narxi (chegirmali bo'lsa chegirilgan)
  - Ofitsial narxlar yig'indisi
  - Sizning narxingiz yig'indisi
  - **Jami tejalgan pul** (ofitsial - sizning narx)
  - Jami to'lov summasi
- Savat ma'lumotlari localStorage da saqlanadi (sahifa yopilsa ham)

### Sahifa: Checkout (`/checkout`)
1. **Balansdan yechish tumbleri:**
   - Ko'rinishi: "Balansdan yechish (Joriy balans: X UZS)"
   - Yoqilganda balans jami narxdan chegiriladi
2. **Promokod kiritish:**
   - Matn maydoni + → tugma
   - Bazadan tekshiriladi
   - Foiz (%) yoki summa (UZS) chegirma qo'llanadi
3. **Qoidalar checkbox:**
   - Har bir obunaning qoidalari ko'rsatiladi
   - "Qoidalarga roziman, buzilgan holatda kafolat berilmasligi haqida tanishdim" ✅
4. **To'lov ma'lumotlari:**
   - Karta raqami (1 tap nusxalash) — admin paneldan o'zgartiriladigan
   - To'lov summasi (jami + random 0-999 UZS) — 1 tap nusxalash
   - ⚠️ Ogohlantirish: "Agar kartaga tashlanadigan summa quyidagidan farq qilsa, sizning obunangiz tizim tomonidan aniqlanmay qolishi mumkin. Agar siz bankomatdan yoki chet eldan pul tashlayotgan bo'lsangiz @santyx ga murojaat qiling."
5. **10 daqiqa taymer:**
   - Ortga hisob
   - Muddat tugasa — band qilingan stock qaytariladi

### To'lov tasdiqlangandan keyin:
- **Stock bor:** credential/link Mini App ichida ham, bot xabarida ham ko'rsatiladi
- **Stock yo'q:** foydalanuvchiga xabar: "To'lovingiz tasdiqlandi. Zaxirada obuna qolmaganligi sababli admin siz bilan aloqaga chiqib obuna ulab beradi." + adminga Telegram alert (foydalanuvchi havolasi + obuna nomi)

---

## Faza 4 — Profil

**Maqsad:** Shaxsiy ma'lumotlar, balans, sozlamalar

### Sahifa: Profil (`/profile`)
- **Shaxsiy:** ism, telefon, Telegram username
- **Faol obunalar:** hozirda amal qilayotgan obunalar ro'yxati
  - Obuna muddati tugashiga 1-3 kun qolganda ⚠️ ogohlantirish
- **Balans:** joriy summa
  - Balansni to'ldirish tugmasi (min 5,000 UZS)
  - Balans tarixi (to'ldirish, yechish, bonus)
- **Referal:**
  - Referal link: `t.me/santyxnarxbot?start=ref_xxx`
  - Statistika: nechta odam taklif qilingan, qancha bonus olingan
  - Bonus: admin paneldan sozlanadigan fix summa + taklif qilingan odam har sotib olganda 10%
- **Sozlamalar:**
  - Til tanlash (O'zbek / Rus / Ingliz)
- **FAQ:** savollar ro'yxati (admin paneldan boshqariladi, tartib o'zgartirish)
- **Qo'llab-quvvatlash:** @santyx link
- **Tug'ilgan kun chegirmasi:** 10% (Telegram dan avtomatik olinadi)

### Sahifa: Balans To'ldirish (`/profile/topup`)
- Summa kiritish (min 5,000 UZS)
- **Hisoblash:**
  - Cashback o'chiq: summa + random (0-999) = to'lov summasi = balansga tushadigan summa
  - Cashback yoqiq (10%): summa + 10% bonus + random = balansga; summa + random = to'lov
- Karta raqami (1 tap nusxalash)
- To'lov summasi (1 tap nusxalash)
- ⚠️ Ogohlantirish xabari

---

## Faza 5 — Tarix va Wishlist

### Sahifa: Buyurtmalar Tarixi (`/history`)
- Buyurtma holati: kutilmoqda / tasdiqlandi / bekor qilingan
- Obuna ma'lumotlari: nomi, narx, sanasi
- Obuna muddati: qachon olgan, qachon tugaydi

### Sahifa: Wishlist (`/wishlist`)
- Yoqtirgan obunalar ro'yxati
- Chegirma tushganda: Mini App ichida badge + bot orqali xabar
- Savatga qo'shish tugmasi
- O'chirish tugmasi

---

## Faza 6 — Admin Panel (Alohida sahifa)

**URL:** `/admin` (parol bilan himoyalangan)
**Dizayn:** Doim light mode

### Admin Panel Bo'limlari:

#### 📊 Dashboard (Bosh sahifa)
- Grafik: kunlik / haftalik / oylik sotuvlar
- Raqamlar: jami sotuvlar, daromad, foydalanuvchilar soni, faol obunalar

#### 📦 Mahsulotlar
- Obunalar CRUD (qo'shish, tahrirlash, o'chirish)
- Har bir obunaga: nom, narx, ofitsial narx, muddat, tavsif, logo (Supabase Storage), kategoriya, stock soni
- Qoidalar: umumiy + har bir obunaga alohida

#### 🛒 Buyurtmalar
- Buyurtmalar ro'yxati (holat bilan)
- Tasdiqlash / rad etish
- Export: CSV / Excel

#### 👥 Foydalanuvchilar
- Ro'yxat (ism, telegram, telefon, balans, referal stats)
- Bloklash + xabar yuborish
- Foydalanuvchi ma'lumotlarini ko'rish

#### 🎟️ Promokodlar
- CRUD: kod, turi (% yoki UZS), qiymati, muddati, max ishlatish
- Statistika: necha marta ishlatilgan

#### 💰 Cashback
- "Hammaga Cashback" tumbleri (10%)
- Yoqish / O'chirish

#### 🏷️ Bannerlar
- Rasm yuklash + link + amal qilish muddati
- Faol / nofaol holat

#### ⭐ Sharhlar
- Barcha sharhlar ro'yxati
- O'chirish tugmasi
- Javob yozish

#### ❓ FAQ
- Savollar qo'shish / tahrirlash / o'chirish
- Tartibni o'zgartirish (drag & drop)

#### 🎁 Referal sozlamalari
- Fix bonus summasi
- Foiz (10%)

#### 💳 To'lov sozlamalari
- Karta raqamini o'zgartirish

#### 📤 Bildirishnomalar
- Yangi buyurtma kelganda → Telegram bot orqali admin guruhga xabar

---

## Faza 7 — Polish va Deploy

1. Skeleton loading barcha sahifalarda
2. Error sahifasi + qayta urinish
3. Haptic feedback tugmalarda
4. Minimal sahifa o'tish animatsiyalari
5. Responsive test (turli qurilmalarda)
6. Telegram WebApp test (dark/light tema)
7. 3 tilda test
8. Netlify ga deploy
9. Eski Mini App kodlarini yangilari bilan almashtirish

---

## Texnik Arxitektura

```
Mini App (React + Vite)
├── /src
│   ├── /components      — UI komponentlar
│   │   ├── TabBar.jsx
│   │   ├── ProductCard.jsx
│   │   ├── CartItem.jsx
│   │   ├── SkeletonLoader.jsx
│   │   ├── Banner.jsx
│   │   ├── ReviewForm.jsx
│   │   └── ...
│   ├── /pages           — Sahifalar
│   │   ├── Catalog.jsx
│   │   ├── ProductDetail.jsx
│   │   ├── Cart.jsx
│   │   ├── Checkout.jsx
│   │   ├── Profile.jsx
│   │   ├── TopUp.jsx
│   │   ├── History.jsx
│   │   ├── Wishlist.jsx
│   │   ├── FAQ.jsx
│   │   └── Onboarding.jsx
│   ├── /admin           — Admin panel
│   │   ├── Dashboard.jsx
│   │   ├── Products.jsx
│   │   ├── Orders.jsx
│   │   ├── Users.jsx
│   │   ├── Promos.jsx
│   │   ├── Reviews.jsx
│   │   ├── Banners.jsx
│   │   ├── FAQ.jsx
│   │   └── Settings.jsx
│   ├── /hooks            — Custom hooklar
│   ├── /utils            — Yordamchi funksiyalar
│   ├── /i18n             — Tarjimalar (uz, ru, en)
│   ├── /lib              — Supabase client
│   └── App.jsx           — Routing
├── /netlify/functions    — Backend API
│   ├── webapp-api.js     — Asosiy API
│   └── admin-api.js      — Admin API
└── /public
```

---

## Supabase Yangi Jadvallar (kerak bo'lishi mumkin)

| Jadval | Maqsad |
|--------|--------|
| `reviews` | Foydalanuvchi sharhlari (user_id, product_id, rating, text, admin_reply) |
| `wishlist` | Yoqtirganlar (user_id, product_id) |
| `cart_reserved` | Band qilingan stock (user_id, product_id, qty, expires_at) |
| `referrals` | Referal tracking (referrer_id, referred_id, bonus_amount) |
| `banners` | Bannerlar (image_url, link, expires_at, active) |
| `faq` | FAQ savollar (question, answer, sort_order, lang) |
| `balance_history` | Balans tarixi (user_id, type, amount, description) |
| `product_terms` | Obuna qoidalari (product_id, text, lang) |
| `admin_settings` | Umumiy sozlamalar (card_number, cashback_enabled, referral_bonus) |

---

## Ish Tartibi

| Faza | Nima | Taxminiy |
|------|------|----------|
| 1 | Asos (skeleton, auth, routing, SDK) | Birinchi |
| 2 | Katalog (ro'yxat, detail, qidiruv) | Ikkinchi |
| 3 | Savat va Checkout (cart, to'lov, timer) | Uchinchi |
| 4 | Profil (balans, referal, sozlamalar) | To'rtinchi |
| 5 | Tarix va Wishlist | Beshinchi |
| 6 | Admin Panel | Oltinchi |
| 7 | Polish va Deploy | Oxirgi |
