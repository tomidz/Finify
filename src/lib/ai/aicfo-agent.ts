import "server-only";

import { ToolLoopAgent, tool, isStepCount } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { getAccounts, getAccountCurrentBalance } from "@/actions/accounts";
import { getBudgetSummaryVsActual } from "@/actions/budget";
import { getForecast } from "@/actions/forecast";
import {
  getInvestments,
  getCurrentInvestmentValuesByMonth,
  getInvestmentSales,
} from "@/actions/investments";
import { getMonths } from "@/actions/months";
import {
  getNetWorthEvolution,
  getLiabilitiesForYear,
} from "@/actions/net-worth";
import { getPendingRecurring } from "@/actions/recurring";
import { getSavingsGoals } from "@/actions/savings-goals";
import { getTransactionsForRange } from "@/actions/transactions";
import { getUserPreferences } from "@/actions/user-preferences";

type ActionResult<T> = { data: T } | { error: string };

function unwrap<T>(result: ActionResult<T>): T | { error: string } {
  if ("error" in result) return { error: result.error };
  return result.data;
}

const MAX_TRANSACTIONS = 300;

const tools = {
  get_months: tool({
    description:
      "Lista los meses cargados en Finify (id, año, mes). Usá los ids devueltos como monthId en las demás tools.",
    inputSchema: z.object({}),
    execute: async () => unwrap(await getMonths()),
  }),
  get_user_preferences: tool({
    description:
      "Preferencias del usuario, incluida la moneda base en la que están expresados todos los montos consolidados.",
    inputSchema: z.object({}),
    execute: async () => unwrap(await getUserPreferences()),
  }),
  get_accounts: tool({
    description:
      "Lista las cuentas del usuario (nombre, tipo, moneda). No incluye saldos: usá get_account_balance.",
    inputSchema: z.object({}),
    execute: async () => unwrap(await getAccounts()),
  }),
  get_account_balance: tool({
    description:
      "Saldo actual de una cuenta: amount en la moneda de la cuenta y base_amount en moneda base.",
    inputSchema: z.object({
      accountId: z.string().describe("id de la cuenta (de get_accounts)"),
    }),
    execute: async ({ accountId }) =>
      unwrap(await getAccountCurrentBalance(accountId)),
  }),
  get_budget_summary: tool({
    description:
      "Resumen presupuesto estimado vs real de un mes, por categoría (ingresos, gastos esenciales, discrecionales, deudas, ahorro, inversión) con variaciones.",
    inputSchema: z.object({
      monthId: z.string().describe("id del mes (de get_months)"),
    }),
    execute: async ({ monthId }) =>
      unwrap(await getBudgetSummaryVsActual(monthId)),
  }),
  get_transactions: tool({
    description:
      "Transacciones de un rango de meses (inclusive), compactadas: fecha, descripción, categoría, tipo y monto en moneda base. Máximo 300 filas por llamada; si se trunca, pedí un rango menor.",
    inputSchema: z.object({
      startMonthId: z.string().describe("id del mes inicial (de get_months)"),
      endMonthId: z.string().describe("id del mes final (de get_months)"),
    }),
    execute: async ({ startMonthId, endMonthId }) => {
      const result = await getTransactionsForRange(startMonthId, endMonthId);
      if ("error" in result) return { error: result.error };
      const rows = result.data.map((tx) => ({
        date: tx.date,
        description: tx.description,
        category: tx.category_name,
        type: tx.transaction_type,
        base_amount: tx.amounts.reduce(
          (sum, line) => sum + (line.current_base_amount ?? line.base_amount),
          0,
        ),
        accounts: tx.amounts.map((line) => line.account_name),
      }));
      return {
        total: rows.length,
        truncated: rows.length > MAX_TRANSACTIONS,
        transactions: rows.slice(0, MAX_TRANSACTIONS),
      };
    },
  }),
  get_net_worth_evolution: tool({
    description:
      "Evolución mensual del patrimonio neto de un año: activos, pasivos y net worth en moneda base.",
    inputSchema: z.object({
      year: z.number().int().describe("año calendario, ej. 2026"),
    }),
    execute: async ({ year }) => unwrap(await getNetWorthEvolution(year)),
  }),
  get_liabilities: tool({
    description: "Pasivos/deudas por mes para un año dado, en moneda base.",
    inputSchema: z.object({ year: z.number().int() }),
    execute: async ({ year }) => unwrap(await getLiabilitiesForYear(year)),
  }),
  get_investments: tool({
    description:
      "Posiciones de inversión (lotes): instrumento, ticker, cantidad, costo, fecha de compra, cuenta.",
    inputSchema: z.object({}),
    execute: async () => unwrap(await getInvestments()),
  }),
  get_investment_sales: tool({
    description:
      "Ventas de inversiones registradas, con resultado realizado (ganancia/pérdida).",
    inputSchema: z.object({}),
    execute: async () => unwrap(await getInvestmentSales()),
  }),
  get_investment_values: tool({
    description:
      "Valor de mercado actual vs costo del portafolio por mes para un año dado, en moneda base.",
    inputSchema: z.object({ year: z.number().int() }),
    execute: async ({ year }) =>
      unwrap(await getCurrentInvestmentValuesByMonth(year)),
  }),
  get_forecast: tool({
    description:
      "Proyección de los próximos meses (ingresos/gastos esperados) basada en históricos y recurrentes.",
    inputSchema: z.object({
      monthsAhead: z.number().int().min(1).max(24).default(6),
    }),
    execute: async ({ monthsAhead }) => unwrap(await getForecast(monthsAhead)),
  }),
  get_savings_goals: tool({
    description: "Metas de ahorro con progreso actual.",
    inputSchema: z.object({}),
    execute: async () => unwrap(await getSavingsGoals()),
  }),
  get_pending_recurring: tool({
    description:
      "Transacciones recurrentes que todavía no fueron registradas en un mes dado.",
    inputSchema: z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }),
    execute: async ({ year, month }) =>
      unwrap(await getPendingRecurring(year, month)),
  }),
};

function buildInstructions(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Sos el AI CFO de Finify, la app de finanzas personales del usuario. Hoy es ${today}.

Tu trabajo: analizar sus gastos, presupuesto, inversiones, deudas y patrimonio, y responder con criterio de CFO — números concretos, tendencias y recomendaciones accionables.

Reglas:
- Todos los datos salen EXCLUSIVAMENTE de las tools. Nunca inventes montos, meses ni posiciones. Si una tool devuelve { error }, decilo tal cual.
- Empezá casi siempre por get_months y get_user_preferences para saber qué meses existen y cuál es la moneda base; expresá los totales en esa moneda e indicala.
- Sos de solo lectura: no podés crear ni modificar nada. Si el usuario pide un cambio (registrar un gasto, editar el presupuesto), explicá en qué pantalla hacerlo.
- No des asesoramiento financiero regulado; analizá los datos y presentá opciones con sus trade-offs.
- Respondé en el idioma del usuario (por defecto español rioplatense). Montos con separador de miles y 0-2 decimales.
- Sé selectivo: mostrá los números que cambian la conclusión, no volcados completos de datos. Usá tablas Markdown solo para comparaciones cortas.`;
}

export function createAicfoAgent() {
  return new ToolLoopAgent({
    model: anthropic("claude-opus-4-8"),
    instructions: buildInstructions(),
    tools,
    stopWhen: isStepCount(15),
  });
}

export type AicfoAgent = ReturnType<typeof createAicfoAgent>;
