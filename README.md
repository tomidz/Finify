# Finify

Personal finance tracker: multi-currency accounts, monthly ledger with carried-forward opening balances, budgets, investments (lots + sales), debts, savings goals and net-worth evolution. Next.js 16 (App Router) + Supabase (Postgres, RLS, Auth) + TanStack Query.

## Getting started

```bash
pnpm install
cp .env.example .env        # fill in Supabase URL + publishable key

# Local Supabase (Docker required)
supabase start              # prints local URL/keys → use them in .env
supabase db reset           # applies supabase/migrations/ in order

pnpm dev                    # http://localhost:3000
```

Sign up through the app; a DB trigger seeds default categories and preferences for new users.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` | Dev server / production build |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | Vitest unit tests |
| `pnpm db:types:generate` | Regenerate `src/types/database.types.ts` from local DB |
| `pnpm db:types:check` | CI guard: fail if generated types drift |

## Architecture notes

- **No API routes**: clients call server actions in `src/actions/*`, which talk to Supabase under RLS. Every table is scoped by `user_id = auth.uid()`.
- **Ledger model**: `transactions` (soft-delete via `deleted_at`) + `transaction_amounts` (one leg per account; transfers have two legs, source leg includes the fee). `months` × `opening_balances` chain balances month to month; `recalculateOpeningBalances` (src/actions/months.ts) rebuilds the chain after any mutation in a past month — a failure aborts the chain rather than propagating stale data.
- **FX**: `fx_rates` caches provider quotes (`frankfurter` for fiat, `dolarapi` for ARS — current-only; rates are never cached under a date they weren't quoted for).
- **Investments**: lots in `investments`; buys auto-debit cash via linked `investment`-type transactions, sales auto-credit — only when the investment currency matches the account currency.
- **Migrations**: `supabase/migrations/`, applied to production automatically on merge to `main` (`.github/workflows/db-deploy.yml`). Never edit a merged migration; CI enforces strictly-increasing numbering.

## Deploy

Vercel (app) + Supabase (DB). Set the `.env.example` variables in Vercel; DB migrations deploy from CI on merge to `main`.
