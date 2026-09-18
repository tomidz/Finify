import { logError } from "@/lib/log";

/*
 * The one way the market-data and FX clients call a provider. It also runs in
 * the browser (the dialogs ask Frankfurter and CoinGecko directly), so nothing
 * here is server-only.
 */

/** Why a provider gave no answer. */
export type ProviderFailure = "not_found" | "rate_limited" | "timeout" | "unavailable" | "bad_response";

export type ProviderResult<T> = { ok: true; data: T } | { ok: false; reason: ProviderFailure };

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The failure an HTTP status stands for; also the error codes some providers
 * put in a 200 body. A 400 is a question with no answer, like a 404.
 */
export function failureForStatus(status: number): ProviderFailure {
  if (status === 400 || status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

/** "not_found" only when every attempt said so: any other failure leaves the answer unknown. */
export function combineFailures(reasons: readonly ProviderFailure[]): ProviderFailure {
  return reasons.find((reason) => reason !== "not_found") ?? "not_found";
}

/** A failure the client found in an answer, logged like fetchJson's own. */
export function providerFailure(tag: string, reason: ProviderFailure): { ok: false; reason: ProviderFailure } {
  logError(tag, reason);
  return { ok: false, reason };
}

/**
 * GETs `url` as JSON, giving up after `timeoutMs`. A failure is logged under
 * `tag` with its reason and HTTP status only: the URL or the headers can carry
 * a key.
 */
export async function fetchJson<T>(
  tag: string,
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<ProviderResult<T>> {
  const result = await request<T>(url, options.headers, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (result.ok) return result;
  // The status tells a rejected key (401, 403) from an outage.
  logError(tag, result.reason, "status" in result ? { status: result.status } : undefined);
  return { ok: false, reason: result.reason };
}

async function request<T>(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<ProviderResult<T> | { ok: false; reason: ProviderFailure; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return { ok: false, reason: failureForStatus(response.status), status: response.status };
    const body = await response.text();
    try {
      return { ok: true, data: JSON.parse(body) as T };
    } catch {
      return { ok: false, reason: "bad_response" };
    }
  } catch {
    // Only the timer aborts; anything else is a request that got no answer.
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
