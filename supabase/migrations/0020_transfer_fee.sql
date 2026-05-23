ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS fee NUMERIC(18,4) NOT NULL DEFAULT 0
  CHECK (fee >= 0);

COMMENT ON COLUMN public.transactions.fee IS 'Fee/commission absorbed in transfers, in source currency. Source debit = amount + fee; dest receives amount.';
