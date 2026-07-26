-- Faza 5 (Wishlist) — "narx tushdi" kuzatuvi uchun.
-- Wishlistga qo'shilgan paytdagi narx saqlanadi; joriy narx undan past bo'lsa badge ko'rsatiladi.
alter table wishlist add column if not exists price_at_add numeric(12,2);
