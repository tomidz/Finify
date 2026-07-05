-- Historical holdings in net-worth views (product decision 2026-07-05):
-- past months must show the investments held AT THAT TIME, not today's lots
-- projected backwards. Lots are mutated/deleted on sale, so selling used to
-- erase the position from every earlier month and the evolution chart dipped
-- retroactively.
--
-- Reconstruction: invested(M) = current lots purchased on or before M
--                             + cost basis of sales that happened AFTER M
-- (investment_sales.cost_basis records exactly what each sale removed).
-- Approximation: a sold lot's original purchase date is not recorded, so
-- months before the (unknown) purchase can be slightly overstated for
-- positions bought and sold within the same window. Strictly better than
-- the previous behavior, which understated every pre-sale month to zero.

create or replace function public.net_worth_evolution_year(
  p_year integer,
  p_base_currency text default null
)
returns table (
  month integer,
  assets numeric,
  liabilities numeric,
  net_worth numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  months_in_year as (
    select m.id, m.month
    from public.months m
    where m.user_id = auth.uid()
      and m.year = p_year
  ),
  opening_assets as (
    select
      ob.month_id,
      sum(ob.opening_base_amount)::numeric as assets
    from public.opening_balances ob
    join months_in_year miy on miy.id = ob.month_id
    group by ob.month_id
  ),
  transaction_assets as (
    select
      t.month_id,
      sum(ta.base_amount)::numeric as assets
    from public.transactions t
    join public.transaction_amounts ta on ta.transaction_id = t.id
    join months_in_year miy on miy.id = t.month_id
    where t.user_id = auth.uid()
      and t.deleted_at is null
    group by t.month_id
  ),
  cash_assets as (
    select
      miy.month,
      coalesce(oa.assets, 0) + coalesce(ta.assets, 0) as assets
    from months_in_year miy
    left join opening_assets oa on oa.month_id = miy.id
    left join transaction_assets ta on ta.month_id = miy.id
  ),
  month_ends as (
    select
      miy.month,
      (make_date(p_year, miy.month, 1) + interval '1 month')::date as next_month_start
    from months_in_year miy
  ),
  investment_assets as (
    select
      me.month,
      (
        select coalesce(sum(
          case
            when i.currency = base.code then i.total_cost
            else i.total_cost * coalesce(public.latest_fx_rate(current_date, i.currency, base.code), 1)
          end
        ), 0)
        from public.investments i
        where i.user_id = auth.uid()
          and i.purchase_date < me.next_month_start
      )
      +
      (
        -- Positions sold after this month still existed during it.
        select coalesce(sum(
          case
            when s.currency = base.code then s.cost_basis
            else s.cost_basis * coalesce(public.latest_fx_rate(current_date, s.currency, base.code), 1)
          end
        ), 0)
        from public.investment_sales s
        where s.user_id = auth.uid()
          and s.sale_date >= me.next_month_start
      ) as assets
    from month_ends me
    cross join base
  ),
  liability_items as (
    select i.id, i.currency
    from public.nw_items i
    where i.user_id = auth.uid()
      and i.side = 'liability'
  ),
  liability_snapshots as (
    select
      miy.month,
      li.id as item_id,
      (
        select case
          when li.currency = base.code then ns.amount
          else coalesce(
            ns.amount * public.latest_fx_rate(current_date, li.currency, base.code),
            ns.amount_base,
            ns.amount
          )
        end
        from public.nw_snapshots ns
        cross join base
        where ns.nw_item_id = li.id
          and (
            ns.year < p_year
            or (ns.year = p_year and ns.month <= miy.month)
          )
        order by ns.year desc, ns.month desc
        limit 1
      ) as value_base
    from months_in_year miy
    cross join liability_items li
  ),
  liabilities as (
    select month, coalesce(sum(value_base), 0)::numeric as liabilities
    from liability_snapshots
    group by month
  )
  select
    miy.month,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0))::numeric as assets,
    coalesce(l.liabilities, 0)::numeric as liabilities,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0) - coalesce(l.liabilities, 0))::numeric as net_worth
  from months_in_year miy
  left join cash_assets ca on ca.month = miy.month
  left join investment_assets ia on ia.month = miy.month
  left join liabilities l on l.month = miy.month
  order by miy.month;
$$;

-- Same reconstruction for the per-account year view (per-account is exact:
-- investment_sales carries account_id).
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
  period_end as (
    select (make_date(p_year, lm.month, 1) + interval '1 month')::date as next_month_start
    from latest_month lm
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
  lot_values as (
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
    cross join period_end pe
    where i.user_id = auth.uid()
      and i.purchase_date < pe.next_month_start
    group by i.account_id
  ),
  sold_values as (
    select
      s.account_id,
      sum(s.cost_basis)::numeric as investment_value,
      sum(
        case
          when s.currency = base.code then s.cost_basis
          else s.cost_basis * coalesce(public.latest_fx_rate(current_date, s.currency, base.code), 1)
        end
      )::numeric as investment_value_base
    from public.investment_sales s
    cross join base
    cross join period_end pe
    where s.user_id = auth.uid()
      and s.sale_date >= pe.next_month_start
    group by s.account_id
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
    coalesce(lv.investment_value, 0) + coalesce(sv.investment_value, 0) as investment_value,
    coalesce(lv.investment_value_base, 0) + coalesce(sv.investment_value_base, 0) as investment_value_base
  from account_rows a
  left join openings o on o.account_id = a.id
  left join movements m on m.account_id = a.id
  left join lot_values lv on lv.account_id = a.id
  left join sold_values sv on sv.account_id = a.id
  where exists (select 1 from latest_month)
  order by a.account_type, a.name;
$$;
