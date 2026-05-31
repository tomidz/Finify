-- ============================================================
-- 0030: Add 'credit_card' to the account_type enum
-- ============================================================
-- A credit card is modelled as a regular account whose balance goes negative
-- as expenses are charged, and is paid down via a transfer from another account.

ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'credit_card';
