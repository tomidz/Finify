-- Audit hardening (2026-07):
-- 1) Widen money columns to scale 8: NUMERIC(18,4) rounds 8-decimal crypto
--    amounts (0.00005 BTC → 0.0001; 0.00004 → 0.0000, violating amount <> 0).
-- 2) transaction_amounts/investments account FKs: RESTRICT fires before the
--    accounts→transactions cascades when deleting an auth user, making user
--    deletion impossible. NO ACTION defers the check to end of statement,
--    when the cascades have already cleared the rows.
-- 3) latest_fx_rate: deterministic tiebreak when two sources quote the same
--    (date, pair) — prefer the freshest insert instead of an arbitrary row.

-- 1) Money precision -------------------------------------------------------
ALTER TABLE public.transaction_amounts
  ALTER COLUMN amount TYPE NUMERIC(18, 8),
  ALTER COLUMN base_amount TYPE NUMERIC(18, 8);

ALTER TABLE public.opening_balances
  ALTER COLUMN opening_amount TYPE NUMERIC(18, 8),
  ALTER COLUMN opening_base_amount TYPE NUMERIC(18, 8);

-- 2) FK ordering vs auth-user deletion --------------------------------------
ALTER TABLE public.transaction_amounts
  DROP CONSTRAINT IF EXISTS transaction_amounts_account_id_fkey;
ALTER TABLE public.transaction_amounts
  ADD CONSTRAINT transaction_amounts_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES public.accounts(id);

ALTER TABLE public.investments
  DROP CONSTRAINT IF EXISTS investments_account_id_fkey;
ALTER TABLE public.investments
  ADD CONSTRAINT investments_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES public.accounts(id);

-- 3) Deterministic FX lookup -------------------------------------------------
create or replace function public.latest_fx_rate(
  p_reference_date date,
  p_from_currency text,
  p_to_currency text
) returns numeric
language sql
stable
as $$
  select case
    when p_from_currency = p_to_currency then 1::numeric
    else (
      select fx.rate
      from public.fx_rates fx
      where fx.from_currency = p_from_currency
        and fx.to_currency = p_to_currency
        and fx.rate_date <= p_reference_date
      order by fx.rate_date desc, fx.created_at desc
      limit 1
    )
  end;
$$;

-- Sanity: a self-pair rate is meaningless and would shadow real quotes.
ALTER TABLE public.fx_rates
  DROP CONSTRAINT IF EXISTS fx_rates_distinct_currencies_check;
ALTER TABLE public.fx_rates
  ADD CONSTRAINT fx_rates_distinct_currencies_check
    CHECK (from_currency <> to_currency);
