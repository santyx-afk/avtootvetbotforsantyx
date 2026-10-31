# To'plamlar: qaysi paketlar va qancha narxda

To'plam — bitta narxga 2–3 ta obuna. Kodda qo'llab-quvvatlanadi: to'plam
checkout paytida tarkibiy rejalarga yoyiladi va har bir obuna **alohida
akkaunt** sifatida, bitta buyurtmada yetkaziladi.

## Nega to'plam ishlaydi

| Sabab | Izoh |
|---|---|
| O'rtacha chek oshadi | 39 000 lik xarid 55 000 ga aylanadi — reklama narxi o'zgarmay turib |
| Chegirmasiz chegirma | Mijoz «arzon oldim» deydi, siz esa alohida mahsulot narxini pasaytirmaysiz |
| Mijozni ushlab turadi | Ikki xizmatga bog'langan odam oyma-oy qaytadi |
| Taqqoslashni qiyinlashtiradi | «CapCut qancha?» deb narx solishtirgan odam to'plamni taqqoslay olmaydi |

Chegirma berish o'rniga to'plam qilish afzal: chegirma so'ragan mijoz to'liq
narxda olganga nisbatan ikki barobar tez ketadi va sizni «arzon» deb
belgilaydi. To'plamda esa har bir mahsulotning e'lon qilingan narxi
o'zgarmaydi.

---

## Narx formulasi

```
1-qadam.  Alohida narxlar yig'indisi    = S
2-qadam.  To'plam narxi (boshlang'ich)  = S × 0,80      (20% tejash)
3-qadam.  Yaxlitlash                     → eng yaqin 1 000 ga pastga
4-qadam.  MARJA TEKSHIRUVI               — pastga qarang
```

### Marja tekshiruvi (eng muhim qadam)

To'plam marjasi alohida sotishdagi marjadan **past bo'lmasligi** kerak.
Aks holda to'plam har sotilganda siz pul yo'qotasiz — faqat sekinroq.

```
To'plam marjasi (%) = (to'plam narxi − tarkibiy tannarxlar yig'indisi)
                      ÷ to'plam narxi × 100
```

Bu raqam alohida sotishdagi o'rtacha marjadan past chiqsa, tejash foizini
20% dan 15% ga, kerak bo'lsa 12% ga tushiring. **12% dan past tejash
to'plamni sotmaydi** — mijoz farqni sezmaydi, demak unda to'plam qilishning
ma'nosi yo'q: yoki tannarxni pasaytirasiz, yoki bu juftlikdan voz kechasiz.

Admin paneldagi to'plam muharriri «Alohida / To'plam / Mijoz tejaydi»
qatorini o'zi hisoblab turadi — narxni kiritganingizda darhol ko'rinadi.
Marjani esa Dashboard → *Rejalar bo'yicha foyda* ko'rsatadi (tannarx
kiritilgan bo'lsa).

---

## Taklif qilinadigan to'plamlar

> ⚠️ Quyidagi narxlar **misol** — repozitoriyadagi namuna ma'lumotlardan
> olingan. O'z katalogingizdagi haqiqiy narxlarni qo'ying va har bir
> to'plam uchun marja tekshiruvini qayta hisoblang.

### 1. Kontent Starter — CapCut Pro + Canva Pro

Eng keng auditoriya: Reels qiladigan har bir odam ikkalasini ham ishlatadi.

| | |
|---|---|
| Tarkibi | CapCut Pro (1 oy) + Canva Pro (1 oy) |
| Alohida | 39 000 + 29 000 = **68 000** |
| To'plam narxi | **55 000** |
| Mijoz tejaydi | 13 000 (19%) |
| Kimga | Reels qiladiganlar, SMM, kichik biznes egalari |

**Sotuv gapi:** «Montaj CapCut'da, dizayn Canva'da. Ikkalasi bir oy —
bitta narxda.»

### 2. Dizayner to'plami — Canva Pro + Adobe

| | |
|---|---|
| Tarkibi | Canva Pro (1 oy) + Adobe (1 oy) |
| Alohida | 29 000 + 149 000 = **178 000** |
| To'plam narxi | **145 000** |
| Mijoz tejaydi | 33 000 (19%) |
| Kimga | Dizaynerlar, studiyalar |

**Diqqat:** Adobe tannarxi yuqori bo'lsa, tejashni 12–15% ga tushiring.
Qimmat mahsulotda 19% tejash marjani yeb qo'yishi mumkin.

### 3. AI to'plami — Gemini AI Pro + ChatGPT Plus

| | |
|---|---|
| Tarkibi | Gemini AI Pro (1 oy) + ChatGPT Plus (1 oy) |
| Alohida | 89 000 + 120 000 = **209 000** |
| To'plam narxi | **169 000** |
| Mijoz tejaydi | 40 000 (19%) |
| Kimga | Kopirayter, marketolog, talaba, dasturchi |

### 4. Kontent Max — CapCut + Canva + Gemini AI

Eng yuqori chek. Kam sotiladi, lekin **boshqa to'plamlarni arzon
ko'rsatadi** — asosiy vazifasi shu.

| | |
|---|---|
| Tarkibi | CapCut Pro + Canva Pro + Gemini AI Pro (1 oy) |
| Alohida | 39 000 + 29 000 + 89 000 = **157 000** |
| To'plam narxi | **125 000** |
| Mijoz tejaydi | 32 000 (20%) |
| Kimga | To'liq kontent ishlab chiqaruvchilar, agentliklar |

### Nomlash haqida

Nom **natijani** aytadi, tarkibni emas. «CapCut + Canva to'plami» emas,
«Kontent Starter». Sabab: tarkib narx taqqoslashga chaqiradi, natija esa
o'zini o'zi sotadi. Tarkib baribir kartochka ostida ko'rinib turadi
(sayt va Mini App to'plam tarkibini o'zi chiqaradi).

---

## Admin panelda qanday yaratiladi

1. **Migratsiyani ishga tushiring** (bir marta):
   Supabase → SQL Editor → `migrations/2026-10-31_source-tracking-and-bundles.sql`
2. Admin panel → **Rejalar** → *Yangi reja*
3. To'ldiring:
   - **Nomi:** `Kontent Starter`
   - **Narx:** `55000`
   - **Tannarx:** tarkibiy rejalar tannarxlari yig'indisi (foyda hisobi uchun)
   - **Muddat:** `1 oy`
   - **Yetkazish turi:** ahamiyatsiz — to'plamda har bir tarkibiy reja
     o'zining yetkazish turi bilan ketadi
   - **To'plam (bundle):** ✅ belgilang
4. Ochilgan **To'plam tarkibi** bo'limida obunalarni tanlang va miqdorini
   kiriting. Pastda «Alohida / To'plam / Mijoz tejaydi» qatori chiqadi —
   tejash 15–20% oralig'ida ekanini tekshiring.
5. Saqlang.

**Nima bo'ladi:** mijoz to'plamni sotib olsa, bitta buyurtma yaratiladi,
lekin ichida tarkibiy rejalar soniga teng element bo'ladi. Har biriga
zaxiradan alohida akkaunt biriktiriladi va hammasi avtomatik yuboriladi.
Birortasining zaxirasi tugagan bo'lsa, buyurtma «zaxira kutilmoqda»
holatiga tushadi va siz ogohlantirish olasiz — qolganlari baribir ketadi.

**Cheklovlar:**
- To'plam ichiga boshqa to'plam qo'shib bo'lmaydi (bazada ham to'siq bor)
- Variantli rejalar (ota rejasi borlar) to'plamga kirmaydi
- Kamida 2 ta obuna bo'lishi kerak

---

## Qayerda ko'rsatiladi

| Joy | Nima ko'rinadi |
|---|---|
| Bosh sahifa, kartochka | «To'plam» belgisi + tarkib ro'yxati |
| Bosh sahifa, narxlar jadvali | Tarkib + «tejaysiz 13 000 UZS» yozuvi |
| Mini App, katalog va mahsulot sahifasi | To'plam belgisi va tarkibi |
| Reels | `reels_11` ssenariysi aynan to'plam haqida |
| chatla avto-DM | Birinchi xabarda to'plam alohida qator bilan turadi |

## 30 kundan keyin nimani tekshirasiz

1. **O'rtacha chek** (Dashboard) — to'plamdan oldingi bilan solishtiring.
   Asosiy maqsad shu raqam.
2. **Rejalar bo'yicha foyda** — to'plamning marjasi alohida mahsulotlar
   marjasidan past emasligini tekshiring.
3. **Qaysi to'plam sotilmadi** — ikki oy davomida sotilmagan to'plamni
   o'chiring. Uchtadan ko'p to'plam tanlovni qiyinlashtiradi va umumiy
   sotuvni pasaytiradi.
