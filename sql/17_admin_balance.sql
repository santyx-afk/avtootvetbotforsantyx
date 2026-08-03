-- FIX 6: Admin balans boshqaruvi tarixi wallet_transactions'da saqlanadi.
-- Yangi turlar qo'shamiz (mavjud credit/debit/refund/bonus saqlanadi).
-- Balansning o'zi user_wallets.balance'da, addWalletTransaction ikkalasini birga yangilaydi.

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('credit', 'debit', 'refund', 'bonus', 'admin_credit', 'admin_debit', 'cashback', 'referral'));

-- Admin kim o'zgartirganini bilish uchun (ixtiyoriy).
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS admin_id TEXT;
