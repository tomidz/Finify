/*
 * The model the AI CFO runs on and what it costs. Everything that names the
 * model or prices a turn reads it from here.
 */

export const AI_MODEL = "claude-opus-5";
/** Answers a turn the main model declines (server-side refusal fallback). */
export const AI_FALLBACK_MODEL = "claude-opus-4-8";
/**
 * Output of one model call, thinking included. Set explicitly: the provider
 * does not know this model yet and would default to 4096.
 */
export const MAX_OUTPUT_TOKENS = 32_000;

type Pricing = {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheRead: number;
  /** Writes with the default 5-minute lifetime. */
  cacheWrite: number;
};

// Cache reads bill at 0.1× the input price and 5-minute writes at 1.25×.
const MODEL_PRICING: Record<string, Pricing> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

export type TurnUsage = {
  /** All input tokens, cached or not. */
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
};

export function estimateCostUsd(usage: TurnUsage, model: string = AI_MODEL): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[AI_MODEL];
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens);
  return (
    (uncached * pricing.input +
      usage.cachedInputTokens * pricing.cacheRead +
      usage.cacheWriteTokens * pricing.cacheWrite +
      usage.outputTokens * pricing.output) /
    1_000_000
  );
}

/** What the chat shows when an answer fails midway; the stream carries it. */
export const AICFO_STREAM_FAILURE = "El CFO no pudo terminar la respuesta. Probá de nuevo.";
