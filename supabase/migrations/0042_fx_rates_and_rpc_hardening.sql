-- Tighter rules for the shared FX cache and for the functions in public.
--
-- Compatible with the code already deployed: it inserts frankfurter and
-- dolarapi quotes dated today or earlier and calls every function signed in.
--
-- Rollback:
--   ALTER TABLE public.fx_rates DROP CONSTRAINT fx_rates_source_check;
--   ALTER TABLE public.fx_rates DROP CONSTRAINT fx_rates_rate_date_not_future_check;
--   Recreate public.transfer_investment_lots as in 0034.
--   GRANT EXECUTE ON the functions listed below TO PUBLIC, anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   ALTER FUNCTION public.handle_updated_at() RESET search_path;

-- fx_rates ---------------------------------------------------------------------

-- NOT VALID: applies to new rows without rejecting quotes already stored.
-- One day of slack covers a provider dating its quote in a later time zone.
ALTER TABLE public.fx_rates
  ADD CONSTRAINT fx_rates_source_check
    CHECK (source IN ('frankfurter', 'dolarapi', 'manual')) NOT VALID;
ALTER TABLE public.fx_rates
  ADD CONSTRAINT fx_rates_rate_date_not_future_check
    CHECK (rate_date <= current_date + 1) NOT VALID;

-- transfer_investment_lots: recreated from 0034 with an added validation. ----

create or replace function public.transfer_investment_lots(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_asset_name text,
  p_ticker text,
  p_asset_type text,
  p_currency text,
  p_quantity numeric,
  p_fee_quantity numeric,
  p_transfer_date date,
  p_notes text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_key text := coalesce(nullif(trim(p_ticker), ''), trim(p_asset_name));
  v_total numeric;
  v_remaining numeric;
  v_fee_fraction numeric;
  v_moved numeric;
  v_unit_cost numeric;
  v_moved_cost numeric;
  v_received numeric;
  r record;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Cantidad inválida';
  end if;
  if p_fee_quantity is null or p_fee_quantity < 0 or p_fee_quantity >= p_quantity then
    raise exception 'Comisión inválida';
  end if;
  if p_source_account_id = p_destination_account_id then
    raise exception 'La cuenta origen y destino deben ser diferentes';
  end if;
  if not exists (
    select 1
    from public.accounts
    where id = p_destination_account_id
      and user_id = auth.uid()
  ) then
    raise exception 'Cuenta destino no encontrada';
  end if;

  perform 1
  from public.investments
  where user_id = auth.uid()
    and account_id = p_source_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key
  for update;

  select coalesce(sum(quantity), 0) into v_total
  from public.investments
  where user_id = auth.uid()
    and account_id = p_source_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key;

  if v_total + 0.00000001 < p_quantity then
    raise exception 'No hay cantidad suficiente para transferir';
  end if;

  v_remaining := p_quantity;
  v_fee_fraction := p_fee_quantity / p_quantity;

  for r in
    select *
    from public.investments
    where user_id = auth.uid()
      and account_id = p_source_account_id
      and asset_type = p_asset_type
      and currency = p_currency
      and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key
    order by purchase_date asc, created_at asc
  loop
    exit when v_remaining <= 0.00000001;

    v_moved := least(r.quantity, v_remaining);
    v_unit_cost := case when r.quantity > 0 then r.total_cost / r.quantity else 0 end;
    v_moved_cost := round(v_moved * v_unit_cost, 8);
    v_received := round(v_moved * (1 - v_fee_fraction), 8);

    if v_received > 0.00000001 then
      insert into public.investments (
        user_id, account_id, asset_name, ticker, isin, asset_type,
        quantity, price_per_unit, total_cost, currency, purchase_date, notes
      ) values (
        auth.uid(), p_destination_account_id, r.asset_name, r.ticker, r.isin,
        r.asset_type, v_received, r.price_per_unit, v_moved_cost, r.currency,
        p_transfer_date, coalesce(p_notes, 'Transferido desde otra cuenta')
      );
    end if;

    if r.quantity - v_moved <= 0.00000001 then
      delete from public.investments where id = r.id;
    else
      update public.investments
      set quantity = round(r.quantity - v_moved, 8),
          total_cost = round(r.total_cost - v_moved_cost, 8),
          updated_at = now()
      where id = r.id;
    end if;

    v_remaining := v_remaining - v_moved;
  end loop;
end;
$$;

-- Function privileges ----------------------------------------------------------

-- Every function the migrations create in public expects a signed-in caller.
-- Functions get EXECUTE for PUBLIC by default, so revoking only anon would
-- leave it in place. Listed by name: nothing created outside migrations is
-- touched.
REVOKE EXECUTE ON FUNCTION
  public.account_net_worth_year(integer, text),
  public.budget_summary_vs_actual(uuid, text),
  public.budget_summary_vs_actual_range(uuid, uuid, text),
  public.enforce_ai_quota_extension_rules(),
  public.handle_new_user(),
  public.handle_updated_at(),
  public.latest_fx_rate(date, text, text),
  public.liabilities_year(integer, text),
  public.net_worth_evolution_year(integer, text),
  public.opening_balances_with_current_base(uuid, text),
  public.reduce_investment_lots(uuid, text, text, text, text, numeric),
  public.resolve_base_currency(text),
  public.transactions_feed(uuid, integer, integer, text, public.transaction_type, uuid, uuid, public.budget_category_type),
  public.transfer_investment_lots(uuid, uuid, text, text, text, text, numeric, numeric, date, text),
  public.usage_counts()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.account_net_worth_year(integer, text),
  public.budget_summary_vs_actual(uuid, text),
  public.budget_summary_vs_actual_range(uuid, uuid, text),
  public.enforce_ai_quota_extension_rules(),
  public.handle_new_user(),
  public.handle_updated_at(),
  public.latest_fx_rate(date, text, text),
  public.liabilities_year(integer, text),
  public.net_worth_evolution_year(integer, text),
  public.opening_balances_with_current_base(uuid, text),
  public.reduce_investment_lots(uuid, text, text, text, text, numeric),
  public.resolve_base_currency(text),
  public.transactions_feed(uuid, integer, integer, text, public.transaction_type, uuid, uuid, public.budget_category_type),
  public.transfer_investment_lots(uuid, uuid, text, text, text, text, numeric, numeric, date, text),
  public.usage_counts()
TO authenticated, service_role;

-- Functions created by later migrations start without EXECUTE for PUBLIC (in
-- any schema) or anon (in public). Supabase's defaults still grant
-- authenticated in public; a function in another schema needs its own GRANT.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Fixed search_path for the trigger function. The SQL functions keep none:
-- they run as the caller, so a pinned path guards no privilege boundary, and a
-- SET clause stops the planner from inlining the set-returning ones and adds
-- per-call work to latest_fx_rate, which runs once per row. handle_new_user,
-- the one SECURITY DEFINER, pins it since 0002.
ALTER FUNCTION public.handle_updated_at() SET search_path = '';
