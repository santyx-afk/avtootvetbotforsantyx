-- 2026-10-12 — Rejalarga tannarx (cost_price)
--
-- Nima uchun: dashboard faqat tushumni ko'rsatardi. Tannarx kiritilsa, sof
-- foyda (sotuv − tannarx) kunlik va har bir reja bo'yicha hisoblanadi.
-- Tannarx faqat admin panelda (egasi) ko'rinadi — Mini App, bot va ochiq
-- sahifalar rejaning faqat kerakli maydonlarini qaytaradi.
--
-- Xavfsiz: faqat yangi bo'sh ustun qo'shiladi, mavjud ma'lumot o'zgarmaydi.
-- Idempotent — qayta ishga tushirilsa ham buzilmaydi.
-- Migratsiya qo'llanmaguncha kod ishlayveradi: foyda "tannarx kiritilmagan"
-- deb ko'rsatiladi, reja saqlashda tannarx e'tiborsiz qoldiriladi.

alter table plans add column if not exists cost_price numeric(12,2);

comment on column plans.cost_price is 'Bitta dona tannarxi (UZS). NULL — kiritilmagan.';
