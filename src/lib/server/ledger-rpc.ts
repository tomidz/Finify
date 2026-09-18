import "server-only";

import { dbError } from "@/lib/server/db-errors";

/**
 * The messages the ledger and debt functions raise (P0001) are written for the
 * user; any other database error is logged and replaced (see dbError).
 */
export function ledgerRpcError(
  fn: string,
  error: { code?: string; message: string },
  fallback: string,
): { error: string } {
  return dbError(fn, error, fallback);
}
