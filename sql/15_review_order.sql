-- Sharh qaysi buyurtma uchun qoldirilganini bog'lash (ixtiyoriy).
-- reviews jadvali oldin yaratilgan; bu yerda faqat yangi ustun.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id UUID;
