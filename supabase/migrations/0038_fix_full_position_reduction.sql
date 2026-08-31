-- Selling or adjusting away an entire position always failed.
--
-- reduce_investment_lots scales lots by a factor instead of subtracting:
--
--   v_factor := greatest(0, (v_total - p_quantity) / v_total);
--   update ... set quantity = round(quantity * v_factor, 8);   -- writes 0
--   delete ... where quantity <= 0.00000001;                   -- never runs
--
-- When the whole holding is sold, p_quantity = v_total, so v_factor is 0 and
-- the UPDATE tries to write quantity = 0. The investments_quantity_check
-- constraint (quantity > 0) rejects that row, which aborts the transaction
-- before the DELETE on the next statement can clean the zeroed lots up. The
-- user saw: new row for relation "investments" violates check constraint
-- "investments_quantity_check".
--
-- The same applies to a partial sale that leaves a residue smaller than the
-- rounding step: round(quantity * v_factor, 8) lands on 0 and is rejected
-- identically.
--
-- Fix: delete the lots that would be emptied BEFORE updating the survivors,
-- so no statement ever attempts to store a non-positive quantity. The delete
-- predicate mirrors the value the update would have written, rather than
-- testing the pre-update quantity as the old trailing delete did.
create or replace function public.reduce_investment_lots(
  p_account_id uuid,
  p_asset_name text,
  p_ticker text,
  p_asset_type text,
  p_currency text,
  p_quantity numeric
)
returns numeric
language plpgsql
set search_path to 'public'
as $function$
declare
  v_key text := coalesce(nullif(trim(p_ticker), ''), trim(p_asset_name));
  v_total numeric;
  v_total_cost numeric;
  v_factor numeric;
  v_removed_cost numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Cantidad inválida';
  end if;

  -- Serialize concurrent mutations of this holding.
  perform 1
  from public.investments
  where user_id = auth.uid()
    and account_id = p_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key
  for update;

  select coalesce(sum(quantity), 0), coalesce(sum(total_cost), 0)
    into v_total, v_total_cost
  from public.investments
  where user_id = auth.uid()
    and account_id = p_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key;

  if v_total + 0.00000001 < p_quantity then
    raise exception 'No hay cantidad suficiente (disponible: %)', v_total;
  end if;

  v_factor := greatest(0, (v_total - p_quantity) / v_total);
  v_removed_cost := round(v_total_cost * (1 - v_factor), 4);

  -- Delete first: any lot whose post-reduction quantity would round to zero
  -- (which is every lot when the entire position is sold) must go before the
  -- update runs, or the check constraint aborts the whole transaction.
  delete from public.investments
  where user_id = auth.uid()
    and account_id = p_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key
    and round(quantity * v_factor, 8) <= 0.00000001;

  update public.investments
  set quantity = round(quantity * v_factor, 8),
      total_cost = round(total_cost * v_factor, 4),
      updated_at = now()
  where user_id = auth.uid()
    and account_id = p_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key;

  return v_removed_cost;
end;
$function$;
