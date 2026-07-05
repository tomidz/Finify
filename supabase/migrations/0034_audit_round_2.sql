-- Audit round 2:
-- 1) budget_summary_vs_actual(_range): sign-aware actuals. abs() made a
--    refund (income against an expense category) INCREASE that category's
--    spending. Actual is now signed by category purpose: income categories
--    count inflows positive; every other category counts outflows positive,
--    so refunds reduce spending.
-- 2) account_net_worth_year: value only lots purchased on or before the
--    viewed year's latest month — lots bought in later years inflated past
--    years' net worth.
-- 3) Atomic lot mutations: reduce_investment_lots / transfer_investment_lots
--    lock matching lots FOR UPDATE inside one transaction. The TS loops they
--    replace could double-sell under concurrency and lose position on a
--    mid-loop failure. Lot matching mirrors the UI holding key:
--    coalesce(trim(ticker), trim(asset_name)).

-- 1) Budget actuals: signed by category purpose -----------------------------
create or replace function public.budget_summary_vs_actual(
  p_month_id uuid,
  p_base_currency text default null
)
returns table (
  category_id uuid,
  category_name text,
  category_type public.budget_category_type,
  planned_amount numeric,
  actual_amount numeric,
  variance numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  month_ctx as (
    select m.id, make_date(m.year, m.month, 1) as month_start
    from public.months m
    where m.id = p_month_id
      and m.user_id = auth.uid()
  ),
  plans as (
    select
      l.category_id,
      sum(bmp.planned_amount)::numeric as planned_amount
    from public.budget_month_plans bmp
    join public.budget_lines l on l.id = bmp.line_id
    join month_ctx mc on mc.id = bmp.month_id
    where l.user_id = auth.uid()
    group by l.category_id
  ),
  tx_actuals as (
    select
      t.category_id,
      sum(
        case
          when ta.original_currency = base.code then ta.amount
          else coalesce(
            ta.amount * public.latest_fx_rate(t.date, ta.original_currency, base.code),
            ta.base_amount
          )
        end
      )::numeric as signed_amount
    from public.transactions t
    join month_ctx mc on mc.id = t.month_id
    cross join base
    join lateral (
      select ta.*
      from public.transaction_amounts ta
      where ta.transaction_id = t.id
      order by ta.created_at asc
      limit 1
    ) ta on true
    where t.user_id = auth.uid()
      and t.deleted_at is null
      and t.transaction_type <> 'transfer'
      and t.category_id is not null
    group by t.category_id
  )
  select
    bc.id as category_id,
    bc.name as category_name,
    bc.category_type,
    coalesce(plans.planned_amount, 0) as planned_amount,
    case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as actual_amount,
    coalesce(plans.planned_amount, 0) - case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as variance
  from public.budget_categories bc
  left join plans on plans.category_id = bc.id
  left join tx_actuals on tx_actuals.category_id = bc.id
  where bc.user_id = auth.uid()
  order by bc.display_order asc, bc.name asc;
$$;

create or replace function public.budget_summary_vs_actual_range(
  p_start_month_id uuid,
  p_end_month_id uuid,
  p_base_currency text default null
)
returns table (
  category_id uuid,
  category_name text,
  category_type public.budget_category_type,
  planned_amount numeric,
  actual_amount numeric,
  variance numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  bounds as (
    select
      least(sm.year * 100 + sm.month, em.year * 100 + em.month) as start_code,
      greatest(sm.year * 100 + sm.month, em.year * 100 + em.month) as end_code
    from public.months sm
    join public.months em on em.id = p_end_month_id and em.user_id = auth.uid()
    where sm.id = p_start_month_id
      and sm.user_id = auth.uid()
  ),
  months_in_range as (
    select m.id
    from public.months m
    join bounds b on (m.year * 100 + m.month) between b.start_code and b.end_code
    where m.user_id = auth.uid()
  ),
  plans as (
    select
      l.category_id,
      sum(bmp.planned_amount)::numeric as planned_amount
    from public.budget_month_plans bmp
    join public.budget_lines l on l.id = bmp.line_id
    join months_in_range mir on mir.id = bmp.month_id
    where l.user_id = auth.uid()
    group by l.category_id
  ),
  tx_actuals as (
    select
      t.category_id,
      sum(
        case
          when ta.original_currency = base.code then ta.amount
          else coalesce(
            ta.amount * public.latest_fx_rate(t.date, ta.original_currency, base.code),
            ta.base_amount
          )
        end
      )::numeric as signed_amount
    from public.transactions t
    join months_in_range mir on mir.id = t.month_id
    cross join base
    join lateral (
      select ta.*
      from public.transaction_amounts ta
      where ta.transaction_id = t.id
      order by ta.created_at asc
      limit 1
    ) ta on true
    where t.user_id = auth.uid()
      and t.deleted_at is null
      and t.transaction_type <> 'transfer'
      and t.category_id is not null
    group by t.category_id
  )
  select
    bc.id as category_id,
    bc.name as category_name,
    bc.category_type,
    coalesce(plans.planned_amount, 0) as planned_amount,
    case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as actual_amount,
    coalesce(plans.planned_amount, 0) - case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as variance
  from public.budget_categories bc
  left join plans on plans.category_id = bc.id
  left join tx_actuals on tx_actuals.category_id = bc.id
  where bc.user_id = auth.uid()
  order by bc.display_order asc, bc.name asc;
$$;

-- 2) account_net_worth_year: only lots held as of the viewed period ---------
create or replace function public.account_net_worth_year(
  p_year integer,
  p_base_currency text default null
)
returns table (
  year integer,
  month integer,
  account_id uuid,
  account_name text,
  account_type text,
  currency text,
  currency_symbol text,
  balance numeric,
  balance_base numeric,
  investment_value numeric,
  investment_value_base numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  latest_month as (
    select m.id, m.month
    from public.months m
    where m.user_id = auth.uid()
      and m.year = p_year
    order by m.month desc
    limit 1
  ),
  account_rows as (
    select
      a.id,
      a.name,
      a.account_type,
      a.currency,
      c.symbol as currency_symbol
    from public.accounts a
    join public.currencies c on c.code = a.currency
    where a.user_id = auth.uid()
      and a.is_active = true
  ),
  openings as (
    select
      ob.account_id,
      sum(ob.opening_amount)::numeric as opening_amount,
      sum(ob.opening_base_amount)::numeric as opening_base_amount
    from public.opening_balances ob
    join latest_month lm on lm.id = ob.month_id
    group by ob.account_id
  ),
  movements as (
    select
      ta.account_id,
      sum(ta.amount)::numeric as amount,
      sum(ta.base_amount)::numeric as base_amount
    from public.transaction_amounts ta
    join public.transactions t on t.id = ta.transaction_id
    join latest_month lm on lm.id = t.month_id
    where t.user_id = auth.uid()
      and t.deleted_at is null
    group by ta.account_id
  ),
  investments as (
    select
      i.account_id,
      sum(i.total_cost)::numeric as investment_value,
      sum(
        case
          when i.currency = base.code then i.total_cost
          else i.total_cost * coalesce(public.latest_fx_rate(current_date, i.currency, base.code), 1)
        end
      )::numeric as investment_value_base
    from public.investments i
    cross join base
    where i.user_id = auth.uid()
      -- Lots purchased after the viewed period didn't exist yet: without
      -- this filter a later purchase inflated past years' net worth.
      and i.purchase_date < (
        select (make_date(p_year, lm.month, 1) + interval '1 month')::date
        from latest_month lm
      )
    group by i.account_id
  )
  select
    p_year as year,
    coalesce((select month from latest_month), 0) as month,
    a.id as account_id,
    a.name as account_name,
    a.account_type,
    a.currency,
    a.currency_symbol,
    coalesce(o.opening_amount, 0) + coalesce(m.amount, 0) as balance,
    coalesce(o.opening_base_amount, 0) + coalesce(m.base_amount, 0) as balance_base,
    coalesce(inv.investment_value, 0) as investment_value,
    coalesce(inv.investment_value_base, 0) as investment_value_base
  from account_rows a
  left join openings o on o.account_id = a.id
  left join movements m on m.account_id = a.id
  left join investments inv on inv.account_id = a.id
  where exists (select 1 from latest_month)
  order by a.account_type, a.name;
$$;

-- 3) Atomic lot mutations ----------------------------------------------------

-- Reduce a holding proportionally (sale / downward adjustment). Locks the
-- matching lots, validates availability inside the lock, scales quantity and
-- cost by the same factor, deletes dust rows. Returns the cost basis removed.
create or replace function public.reduce_investment_lots(
  p_account_id uuid,
  p_asset_name text,
  p_ticker text,
  p_asset_type text,
  p_currency text,
  p_quantity numeric
) returns numeric
language plpgsql
set search_path = public
as $$
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

  update public.investments
  set quantity = round(quantity * v_factor, 8),
      total_cost = round(total_cost * v_factor, 4),
      updated_at = now()
  where user_id = auth.uid()
    and account_id = p_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key;

  delete from public.investments
  where user_id = auth.uid()
    and account_id = p_account_id
    and asset_type = p_asset_type
    and currency = p_currency
    and coalesce(nullif(trim(ticker), ''), trim(asset_name)) = v_key
    and quantity <= 0.00000001;

  return v_removed_cost;
end;
$$;

-- Move part of a holding to another account, FIFO, preserving cost basis on
-- what arrives (network fee in asset units raises per-unit cost). All-or-
-- nothing: a failure anywhere rolls the whole move back — the TS loop it
-- replaces could duplicate the position between accounts.
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

revoke all on function public.reduce_investment_lots(uuid, text, text, text, text, numeric) from public;
grant execute on function public.reduce_investment_lots(uuid, text, text, text, text, numeric) to authenticated;
revoke all on function public.transfer_investment_lots(uuid, uuid, text, text, text, text, numeric, numeric, date, text) from public;
grant execute on function public.transfer_investment_lots(uuid, uuid, text, text, text, text, numeric, numeric, date, text) to authenticated;
