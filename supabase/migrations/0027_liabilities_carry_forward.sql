-- ============================================================
-- 0027: Carry forward liability snapshots across years
-- ============================================================
-- liabilities_year (0013) and net_worth_evolution_year (0015) only looked at
-- snapshots WHERE ns.year = p_year, so a debt whose last snapshot is in a prior
-- year vanished (amount coalesced to 0) — inflating net worth and dropping the
-- liability from the year summary and the evolution chart. getLiabilitiesForMonth
-- already carries forward correctly; these two RPCs now match it: take the latest
-- snapshot at-or-before the target period across all years.

create or replace function public.liabilities_year(
  p_year integer,
  p_base_currency text default null
)
returns table (
  item_id uuid,
  name text,
  currency text,
  currency_symbol text,
  amount numeric,
  amount_base numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  items as (
    select i.id, i.name, i.currency, c.symbol as currency_symbol
    from public.nw_items i
    join public.currencies c on c.code = i.currency
    where i.user_id = auth.uid()
      and i.side = 'liability'
  ),
  latest_snapshots as (
    select distinct on (ns.nw_item_id)
      ns.nw_item_id,
      ns.amount,
      ns.amount_base,
      ns.month
    from public.nw_snapshots ns
    join items i on i.id = ns.nw_item_id
    where ns.year <= p_year
    order by ns.nw_item_id, ns.year desc, ns.month desc
  )
  select
    i.id as item_id,
    i.name,
    i.currency,
    i.currency_symbol,
    coalesce(ls.amount, 0) as amount,
    case
      when i.currency = base.code then coalesce(ls.amount, 0)
      else coalesce(
        ls.amount * public.latest_fx_rate(current_date, i.currency, base.code),
        ls.amount_base,
        ls.amount,
        0
      )
    end as amount_base
  from items i
  left join latest_snapshots ls on ls.nw_item_id = i.id
  cross join base
  order by i.name;
$$;

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
  investment_assets as (
    select
      miy.month,
      coalesce(sum(
        case
          when i.currency = base.code then i.total_cost
          else i.total_cost * coalesce(public.latest_fx_rate(current_date, i.currency, base.code), 1)
        end
      ), 0)::numeric as assets
    from months_in_year miy
    cross join base
    left join public.investments i
      on i.user_id = auth.uid()
     and (
       extract(year from i.purchase_date) < p_year
       or (
         extract(year from i.purchase_date) = p_year
         and extract(month from i.purchase_date) <= miy.month
       )
     )
    group by miy.month
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
