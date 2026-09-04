-- 2026-09-04 — Mini App tezligi: eng ko'p ishlatiladigan filtrlar uchun indekslar.
-- PR: claude/app-performance-analysis-j7vbo6
--
-- Nima uchun: Supabase advisor 22 ta indekssiz foreign key ko'rsatdi. Hozir
-- jadvallar kichik va bu sezilmaydi, lekin ma'lumot o'sgani sari har bir
-- katalog/savat/buyurtma so'rovi to'liq jadvalni o'qiy boshlaydi. Bu yerda
-- faqat Mini App'ning issiq yo'llari (catalog, product, cart, checkout,
-- history, to'lovni aniqlash) uchun kerak bo'lganlari.
--
-- Barchasi idempotent (IF NOT EXISTS) — ikki marta ishga tushirilsa buzilmaydi.

-- catalog/product: mavjud stokni reja bo'yicha hisoblash
create index if not exists idx_inventory_items_plan_status
  on inventory_items (plan_id, status);

-- cart_items(plan_id), wishlist(plan_id), order_items(plan_id) — plans(*) join
-- va reja o'chirilganda FK tekshiruvi
create index if not exists idx_cart_items_plan on cart_items (plan_id);
create index if not exists idx_wishlist_plan on wishlist (plan_id);
create index if not exists idx_order_items_plan on order_items (plan_id);

-- catalog: variantli rejalarni ("yaproq" bo'lmaganlarni) aniqlash
create index if not exists idx_plans_parent on plans (parent_plan_id);

-- init/history: foydalanuvchining kutilayotgan buyurtmalari
create index if not exists idx_orders_user_status
  on orders (user_telegram_id, status);

-- Eski partial indekslar faqat status = 'pending_payment' ni qamrab olgan,
-- kod esa in.(waiting_payment,pending_payment) bilan qidiradi — ular
-- ishlatilmay qolgan (advisor "unused index" deb ko'rsatdi). To'g'ri
-- shartli variantlari:
create index if not exists idx_orders_waiting_expires
  on orders (expires_at)
  where status in ('waiting_payment', 'pending_payment');

create index if not exists idx_orders_waiting_unique_price
  on orders (unique_price)
  where status in ('waiting_payment', 'pending_payment');

-- to'lov tasdiqlangach cashback tekshiruvi (audit_logs allaqachon indekslangan)
create index if not exists idx_wallet_transactions_order
  on wallet_transactions (order_id);
