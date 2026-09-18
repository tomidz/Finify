import "server-only";

import { ToolLoopAgent, isStepCount, type LanguageModelUsage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

import { createAicfoTools, type AicfoContext, type AicfoTools } from "@/lib/ai/aicfo-tools";
import { AI_FALLBACK_MODEL, AI_MODEL, MAX_OUTPUT_TOKENS } from "@/lib/ai/model";
import { MONTH_NAMES } from "@/lib/format";
import { currentYearMonth, today } from "@/lib/dates";
import { toYearMonthCode } from "@/lib/months";

export type { AicfoContext } from "@/lib/ai/aicfo-tools";

// The rules, fixed, and then the context, which changes with the day and the
// months: each is cached on its own, so a new day only rewrites the context.
export const RULES = `Sos el AI CFO de Finify, la app de finanzas personales del usuario.

Tu trabajo: analizar sus gastos, presupuesto, inversiones, deudas y patrimonio, y responder con criterio de CFO: números concretos, tendencias y recomendaciones accionables.

Reglas:
- Los datos salen EXCLUSIVAMENTE de las tools. Nunca inventes montos, meses ni posiciones.
- Si una tool devuelve { error }, decilo tal cual y no sigas como si el dato fuera cero.
- Un dato que falta no es cero: null, "sin cotización" (fxMissing, rate_missing) o un error quieren decir que no se sabe; decilo así.
- Si una consulta no trae datos, decí qué consultaste (qué tool y qué período).
- Los montos en moneda base (base_amount, *Base, totales) ya están convertidos: no los vuelvas a convertir. Para convertir otro monto usá convert_currency.
- Para totales de un período usá get_period_summary, que es el mismo cálculo del dashboard; get_transactions es para ver los movimientos.
- Sos de solo lectura: no podés crear ni modificar nada. Si el usuario pide un cambio (registrar un gasto, editar el presupuesto), explicá en qué pantalla hacerlo.
- No des asesoramiento financiero regulado; analizá los datos y presentá opciones con sus trade-offs.
- Respondé en el idioma del usuario (por defecto español rioplatense). Montos con separador de miles y 0-2 decimales, con la moneda.
- Sé selectivo: mostrá los números que cambian la conclusión, no volcados completos de datos. Usá tablas Markdown solo para comparaciones cortas.`;

const monthLabel = (m: { year: number; month: number }) => `${MONTH_NAMES[m.month - 1]} ${m.year}`;

export function buildContext(ctx: Pick<AicfoContext, "baseCurrency" | "months">, now: Date = new Date()): string {
  const sorted = [...ctx.months].sort(
    (a, b) => toYearMonthCode(a.year, a.month) - toYearMonthCode(b.year, b.month),
  );
  const { year, month } = currentYearMonth(now);
  const current = sorted.find((m) => m.year === year && m.month === month);
  const monthsLine =
    sorted.length === 0
      ? "- No hay meses cargados."
      : `- Meses cargados: de ${monthLabel(sorted[0])} (id ${sorted[0].id}) a ${monthLabel(sorted[sorted.length - 1])} (id ${sorted[sorted.length - 1].id}). ${
          current
            ? `El mes en curso es ${monthLabel(current)} (id ${current.id}).`
            : `El mes en curso (${monthLabel({ year, month })}) todavía no está cargado.`
        }`;
  return `Contexto:
- Moneda base: ${ctx.baseCurrency}. Todos los totales están en esa moneda.
- Hoy: ${today(now)} (hora de Argentina).
${monthsLine}`;
}

/** What one step (one model call) spent, and the tools it called. */
export type StepUsage = { usage: LanguageModelUsage; toolNames: string[] };

/**
 * Tools that answer the same question once per turn: the loop often asks
 * twice. A failed read is asked again.
 */
function memoized(tools: AicfoTools): AicfoTools {
  const cache = new Map<string, Promise<unknown>>();
  const wrapped: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(tools)) {
    const execute = definition.execute as ((input: unknown, options: unknown) => Promise<unknown>) | undefined;
    wrapped[name] = !execute
      ? definition
      : {
          ...definition,
          execute: (input: unknown, options: unknown) => {
            const key = `${name}:${JSON.stringify(input)}`;
            const hit = cache.get(key);
            if (hit) return hit;
            const result = execute(input, options);
            cache.set(key, result);
            void result.then(
              (value) => {
                if (value && typeof value === "object" && "error" in value) cache.delete(key);
              },
              () => cache.delete(key),
            );
            return result;
          },
        };
  }
  return wrapped as AicfoTools;
}

export function createAicfoAgent(ctx: AicfoContext, hooks?: { onStep?: (step: StepUsage) => void }) {
  return new ToolLoopAgent({
    model: anthropic(AI_MODEL),
    instructions: [
      { role: "system", content: RULES, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "system", content: buildContext(ctx) },
    ],
    tools: memoized(createAicfoTools(ctx)),
    stopWhen: isStepCount(15),
    // Per model call, thinking included (the model thinks by default).
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    providerOptions: {
      anthropic: {
        // Also caches the conversation so far, so each step of the loop and
        // the next turn only pay for what is new.
        cacheControl: { type: "ephemeral" },
        fallbacks: [{ model: AI_FALLBACK_MODEL }],
        // Thinks less than the default (high), which keeps a turn inside its
        // time limit and costs less; the answers are chat, not long work.
        effort: "medium",
      },
    },
    onStepEnd: hooks?.onStep
      ? (step) => hooks.onStep?.({ usage: step.usage, toolNames: step.toolCalls.map((call) => call.toolName) })
      : undefined,
  });
}

export type AicfoAgent = ReturnType<typeof createAicfoAgent>;
