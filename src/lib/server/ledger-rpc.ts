import "server-only";

/**
 * The messages the ledger and debt functions raise (P0001) are written for the
 * user; any other database error is logged and replaced by `fallback`.
 */
export function ledgerRpcError(
  fn: string,
  error: { code?: string; message: string },
  fallback: string,
): { error: string } {
  if (error.code === "P0001") return { error: error.message };
  console.error(`${fn}:`, error.code, error.message);
  return { error: fallback };
}
