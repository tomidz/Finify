/**
 * One JSON line per caught failure, searchable in the Vercel logs by `tag`:
 * the error's code and the start of its message. Never amounts, rows or other
 * user data: a database error's details (which quote the row) are left out.
 */
export function logError(tag: string, error: unknown, context?: Record<string, string | number | boolean>): void {
  const e = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };
  const message = typeof e.message === "string" ? e.message : typeof error === "string" ? error : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      tag,
      code: typeof e.code === "string" ? e.code : undefined,
      name: typeof e.name === "string" ? e.name : undefined,
      message: message?.slice(0, 200),
      ...context,
    }),
  );
}
