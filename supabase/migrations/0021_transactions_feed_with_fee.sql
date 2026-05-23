drop function if exists public.transactions_feed(uuid, integer, integer, text, public.transaction_type, uuid, uuid, public.budget_category_type);

create or replace function public.transactions_feed(
  p_month_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_transaction_type public.transaction_type default null,
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_category_type public.budget_category_type default null
)
returns table (
  id uuid,
  user_id uuid,
  month_id uuid,
  category_id uuid,
  transaction_type public.transaction_type,
  date date,
  description text,
  notes text,
  fee numeric,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_type public.budget_category_type,
  amounts jsonb
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(null) as code
  ),
  filtered as (
    select
      t.id,
      t.user_id,
      t.month_id,
      t.category_id,
      t.transaction_type,
      t.date,
      t.description,
      t.notes,
      t.fee,
      t.created_at,
      t.updated_at,
      bc.name as category_name,
      bc.category_type
    from public.transactions t
    left join public.budget_categories bc on bc.id = t.category_id
    where t.user_id = auth.uid()
      and t.month_id = p_month_id
      and t.deleted_at is null
      and (p_transaction_type is null or t.transaction_type = p_transaction_type)
      and (p_account_id is null or exists (
        select 1
        from public.transaction_amounts ta
        where ta.transaction_id = t.id
          and ta.account_id = p_account_id
      ))
      and (p_category_id is null or t.category_id = p_category_id)
      and (p_category_type is null or bc.category_type = p_category_type)
      and (
        coalesce(nullif(trim(p_search), ''), '') = ''
        or lower(t.description) like '%' || lower(trim(p_search)) || '%'
        or lower(coalesce(bc.name, '')) like '%' || lower(trim(p_search)) || '%'
        or exists (
          select 1
          from public.transaction_amounts ta
          join public.accounts a on a.id = ta.account_id
          where ta.transaction_id = t.id
            and lower(a.name) like '%' || lower(trim(p_search)) || '%'
        )
      )
    order by t.date desc, t.created_at desc
    offset greatest(p_offset, 0)
    limit greatest(p_limit, 1)
  )
  select
    f.id, f.user_id, f.month_id, f.category_id, f.transaction_type,
    f.date, f.description, f.notes, f.fee, f.created_at, f.updated_at,
    f.category_name, f.category_type,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ta.id,
            'transaction_id', ta.transaction_id,
            'account_id', ta.account_id,
            'amount', ta.amount,
            'original_currency', ta.original_currency,
            'exchange_rate', ta.exchange_rate,
            'base_amount', ta.base_amount,
            'created_at', ta.created_at,
            'account_name', a.name,
            'account_currency_symbol', c.symbol,
            'current_base_amount',
              case
                when ta.original_currency = base.code then ta.amount
                else coalesce(
                  ta.amount * public.latest_fx_rate(f.date, ta.original_currency, base.code),
                  ta.base_amount
                )
              end
          )
          order by ta.created_at asc
        )
        from public.transaction_amounts ta
        join public.accounts a on a.id = ta.account_id
        join public.currencies c on c.code = ta.original_currency
        cross join base
        where ta.transaction_id = f.id
      ),
      '[]'::jsonb
    ) as amounts
  from filtered f
  order by f.date desc, f.created_at desc;
$$;
