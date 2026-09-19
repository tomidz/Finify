import { logError } from "@/lib/log";

// Read by name, like the code that uses them, so Next inlines the
// NEXT_PUBLIC_ ones here exactly as it does there. Only names are logged.
const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
// Without these a feature degrades: the AI CFO, stock prices, crypto prices.
const OPTIONAL = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  TWELVEDATA_API_KEY: process.env.TWELVEDATA_API_KEY,
  NEXT_PUBLIC_COINGECKO_API_KEY: process.env.NEXT_PUBLIC_COINGECKO_API_KEY,
};

const missing = (vars: Record<string, string | undefined>) =>
  Object.entries(vars)
    .filter(([, value]) => !value)
    .map(([name]) => name)
    .join(",");

/** Once per server start: one line naming the environment variables that are not set. */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const required = missing(REQUIRED);
  const optional = missing(OPTIONAL);
  if (!required && !optional) return;
  logError("config.missing", "Missing environment variables", { required, optional });
}
