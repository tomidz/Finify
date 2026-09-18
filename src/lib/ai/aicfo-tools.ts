import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { getAccountCurrentBalance, getAccounts } from "@/actions/accounts";
import { getBudgetSummaryVsActual } from "@/actions/budget";
import { getInvestments, getInvestmentSales } from "@/actions/investments";
import { getPendingRecurring } from "@/actions/recurring";
import { getSavingsGoals } from "@/actions/savings-goals";
import { getTransactionsForRange } from "@/actions/transactions";
import { today } from "@/lib/dates";
import { categoryExecution } from "@/lib/finance/budget-status";
import { buildNetWorthView } from "@/lib/finance/net-worth-view";
import { categoryFlow, legBase } from "@/lib/finance/period-summary";
import { toYearMonthCode } from "@/lib/months";
import type { ServerContext } from "@/lib/server/context";
import { loadForecast } from "@/lib/server/forecast";
import { getFxQuote } from "@/lib/server/fx";
import { loadInvestmentValuation } from "@/lib/server/investment-valuation";
import {
  loadAccountNetWorth,
  loadLiabilitiesForYear,
  loadNetWorthEvolution,
  warmCloseRates,
} from "@/lib/server/net-worth";
import { loadPeriodSummary } from "@/lib/server/period-summary";
import type { Month } from "@/types/months";

/*
 * The AI CFO's tools. They read through the same loaders and pure modules as
 * the screens, so the agent and the app agree on every number.
 */

export type AicfoContext = {
  server: ServerContext;
  baseCurrency: string;
  months: Month[];
};

type ActionResult<T> = { data: T } | { error: string };

/** A failed read, in one phrase the agent repeats as it is. */
export function failed(what: string, error: string) {
  return { error: `No se pudo leer ${what}: ${error}` };
}

function unwrap<T>(what: string, result: ActionResult<T>): T | { error: string } {
  return "error" in result ? failed(what, result.error) : result.data;
}

export const MAX_TRANSACTION_ROWS = 300;
export const MAX_TRANSACTION_MONTHS = 12;

export function createAicfoTools(ctx: AicfoContext) {
  const monthById = new Map(ctx.months.map((m) => [m.id, m]));
  const range = (startMonthId: string, endMonthId: string) => {
    const start = monthById.get(startMonthId);
    const end = monthById.get(endMonthId);
    if (!start || !end) return { error: "Mes no encontrado: usá los ids de get_months." } as const;
    if (toYearMonthCode(start.year, start.month) > toYearMonthCode(end.year, end.month)) {
      return { error: "El mes inicial es posterior al final." } as const;
    }
    return { start, end } as const;
  };

  return {
    get_months: tool({
      description: "Meses cargados (id, año, mes), del más viejo al más nuevo. Usá los ids como monthId en las demás tools.",
      inputSchema: z.object({}),
      execute: async () =>
        [...ctx.months]
          .sort((a, b) => toYearMonthCode(a.year, a.month) - toYearMonthCode(b.year, b.month))
          .map((m) => ({ id: m.id, year: m.year, month: m.month })),
    }),
    get_accounts: tool({
      description: "Cuentas (nombre, tipo, moneda, activa). No incluye saldos: usá get_account_balance o get_net_worth.",
      inputSchema: z.object({}),
      execute: async () => unwrap("las cuentas", await getAccounts()),
    }),
    get_account_balance: tool({
      description:
        "Saldo actual de una cuenta: amount en su moneda y base_amount en moneda base a la cotización de hoy (con rate_missing, base_amount es el valor de carga).",
      inputSchema: z.object({ accountId: z.string().describe("id de la cuenta (de get_accounts)") }),
      execute: async ({ accountId }) => unwrap("el saldo de la cuenta", await getAccountCurrentBalance(accountId)),
    }),
    get_period_summary: tool({
      description:
        "Resumen de un mes o rango de meses, el mismo del dashboard: apertura, ingresos, gastos por tipo, resultado (ingresos − gastos), otros movimientos (inversiones, correcciones, comisiones, diferencia de cambio) y cierre, todo en moneda base; más el saldo de cada cuenta en su moneda. Usala para cualquier total de un período.",
      inputSchema: z.object({
        startMonthId: z.string().describe("id del mes inicial (de get_months)"),
        endMonthId: z.string().describe("id del mes final (de get_months); igual al inicial para un mes"),
      }),
      execute: async ({ startMonthId, endMonthId }) => {
        const period = range(startMonthId, endMonthId);
        if ("error" in period) return period;
        const result = await loadPeriodSummary(ctx.server, {
          months: ctx.months,
          start: period.start,
          end: period.end,
          baseCurrency: ctx.baseCurrency,
        });
        return unwrap("el resumen del período", result);
      },
    }),
    get_budget_summary: tool({
      description:
        "Presupuesto de un mes: totales por grupo (ingresos, gastos, ahorro, inversiones) y cada categoría con plan, real, estado (favorable, watch, unfavorable, no-plan) y favorableVariance (positiva cuando va bien: bajo el plan en gastos, sobre el plan en el resto).",
      inputSchema: z.object({ monthId: z.string().describe("id del mes (de get_months)") }),
      execute: async ({ monthId }) => {
        const result = await getBudgetSummaryVsActual(monthId);
        if ("error" in result) return failed("el presupuesto", result.error);
        return {
          totals: result.data.totals,
          categories: result.data.categories.map((category) => {
            const execution = categoryExecution(category);
            return {
              name: category.category_name,
              type: category.category_type,
              planned: category.planned_amount,
              actual: category.actual_amount,
              status: execution.status,
              favorableVariance: execution.favorableVariance,
            };
          }),
        };
      },
    }),
    get_transactions: tool({
      description: `Movimientos de un rango de meses (máximo ${MAX_TRANSACTION_MONTHS}), en moneda base a la cotización de su fecha. Cada fila trae base_amount con signo (+ entra, − sale; null en una transferencia, que solo mueve plata entre cuentas). Los totales cubren todo el rango y no suman transferencias: income y expenses en positivo, other (inversiones y correcciones) con signo. Las filas se cortan en ${MAX_TRANSACTION_ROWS} (truncated). Para totales de un período preferí get_period_summary.`,
      inputSchema: z.object({
        startMonthId: z.string().describe("id del mes inicial (de get_months)"),
        endMonthId: z.string().describe("id del mes final (de get_months)"),
      }),
      execute: async ({ startMonthId, endMonthId }) => {
        const period = range(startMonthId, endMonthId);
        if ("error" in period) return period;
        const months =
          (period.end.year - period.start.year) * 12 + period.end.month - period.start.month + 1;
        if (months > MAX_TRANSACTION_MONTHS) {
          return { error: `El rango tiene ${months} meses; pedí como máximo ${MAX_TRANSACTION_MONTHS}.` };
        }
        const result = await getTransactionsForRange(startMonthId, endMonthId);
        if ("error" in result) return failed("los movimientos", result.error);

        const totals = { income: 0, expenses: 0, other: 0 };
        const rows = result.data.map((tx) => {
          const flow = categoryFlow(tx);
          const amount =
            tx.transaction_type === "transfer"
              ? null
              : flow
                ? flow.income
                  ? flow.amount
                  : -flow.amount
                : tx.amounts.reduce((sum, line) => sum + legBase(line), 0);
          if (flow?.income) totals.income += flow.amount;
          else if (flow) totals.expenses += flow.amount;
          else if (amount != null) totals.other += amount;
          return {
            date: tx.date,
            description: tx.description,
            category: tx.category_name,
            type: tx.transaction_type,
            base_amount: amount,
            accounts: tx.amounts.map((line) => line.account_name),
          };
        });
        return {
          baseCurrency: ctx.baseCurrency,
          count: rows.length,
          totals,
          truncated: rows.length > MAX_TRANSACTION_ROWS,
          transactions: rows.slice(0, MAX_TRANSACTION_ROWS),
        };
      },
    }),
    get_net_worth: tool({
      description:
        "Patrimonio de un año al cierre de su último mes, el mismo de la pantalla: activos por cuenta (caja e inversiones), pasivos, patrimonio neto y la evolución mensual. Cada mes a la cotización de su cierre; las inversiones a valor de mercado solo para el mes en curso, al costo para el resto. fxMissing: hay inversiones o deudas sin cotización fuera de los totales; cashAtBookValue: algún saldo sin cotización va a su valor de carga.",
      inputSchema: z.object({ year: z.number().int().describe("año calendario, ej. 2026") }),
      execute: async ({ year }) => {
        if (!ctx.months.some((m) => m.year === year)) return { error: `No hay meses cargados en ${year}.` };
        await warmCloseRates(ctx.server, ctx.baseCurrency, { months: ctx.months, year });
        const [accounts, liabilities, evolution] = await Promise.all([
          loadAccountNetWorth(ctx.server, year),
          loadLiabilitiesForYear(ctx.server, year),
          loadNetWorthEvolution(ctx.server, year),
        ]);
        if ("error" in accounts) return failed("el patrimonio", accounts.error);
        if ("error" in liabilities) return failed("los pasivos", liabilities.error);
        if ("error" in evolution) return failed("la evolución del patrimonio", evolution.error);
        // Market value only exists for today.
        const valuation =
          accounts.data.close_date === today()
            ? await loadInvestmentValuation(ctx.server, ctx.baseCurrency)
            : null;
        const view = buildNetWorthView({
          accounts: accounts.data,
          liabilities: liabilities.data,
          evolution: evolution.data,
          valuation: valuation && "data" in valuation ? valuation.data : null,
          today: today(),
        });
        return {
          baseCurrency: ctx.baseCurrency,
          closeDate: accounts.data.close_date,
          marketValued: view.marketValued,
          totalAssets: view.totalAssets,
          totalLiabilities: view.totalLiabilities,
          netWorth: view.netWorth,
          fxMissing: view.fxMissing,
          cashAtBookValue: view.cashAtBookValue,
          fxRevaluation: view.fxRevaluation,
          accounts: view.accounts.map((account) => ({
            name: account.name,
            type: account.account_type,
            currency: account.currency,
            active: account.is_active,
            balance: account.balance,
            balanceBase: account.balance_base,
            investmentsBase: account.investment_value_base,
            totalBase: account.total,
          })),
          liabilities: liabilities.data.items.map((item) => ({
            name: item.name,
            currency: item.currency,
            amount: item.amount,
            amountBase: item.amount_base,
          })),
          evolution: view.evolution,
        };
      },
    }),
    get_investments: tool({
      description: "Lotes de inversión: instrumento, ticker, clase, cantidad, costo (en la moneda del lote), fecha de compra y cuenta.",
      inputSchema: z.object({}),
      execute: async () => unwrap("las inversiones", await getInvestments()),
    }),
    get_investment_sales: tool({
      description: "Ventas de inversiones con su resultado realizado (en moneda base; null sin cotización).",
      inputSchema: z.object({}),
      execute: async () => unwrap("las ventas de inversiones", await getInvestmentSales()),
    }),
    get_forecast: tool({
      description:
        "Proyección del saldo total desde hoy hasta el cierre de los próximos meses, la misma del dashboard: lo ya cargado, las fechas de las recurrentes, el presupuesto y la mediana de los meses cerrados. Cada punto trae de qué fuentes salió.",
      inputSchema: z.object({ monthsAhead: z.number().int().min(1).max(24).default(6) }),
      execute: async ({ monthsAhead }) =>
        unwrap("la proyección", await loadForecast(ctx.server, ctx.baseCurrency, monthsAhead, ctx.months)),
    }),
    get_savings_goals: tool({
      description: "Metas de ahorro con su progreso.",
      inputSchema: z.object({}),
      execute: async () => unwrap("las metas de ahorro", await getSavingsGoals()),
    }),
    get_pending_recurring: tool({
      description: "Fechas de las recurrentes de un mes, con las ya registradas marcadas (is_registered).",
      inputSchema: z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }),
      execute: async ({ year, month }) => unwrap("las recurrentes", await getPendingRecurring(year, month)),
    }),
    convert_currency: tool({
      description:
        "Convierte un monto entre monedas a la cotización de una fecha (hoy si no se indica), con la fecha de la cotización usada. Solo para montos que no vienen ya en moneda base.",
      inputSchema: z.object({
        amount: z.number(),
        from: z.string().describe("código de moneda, ej. EUR"),
        to: z.string().describe("código de moneda, ej. USD"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("yyyy-MM-dd; hoy si se omite"),
      }),
      execute: async ({ amount, from, to, date }) => {
        const result = await getFxQuote({ date: date ?? today(), from: from.toUpperCase(), to: to.toUpperCase() });
        if ("error" in result) return failed(`la cotización de ${from} a ${to}`, result.error);
        const { rate, rateDate } = result.data;
        return { amount, from, to, rate, rateDate, converted: amount * rate };
      },
    }),
  };
}

export type AicfoTools = ReturnType<typeof createAicfoTools>;
