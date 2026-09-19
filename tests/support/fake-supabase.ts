/**
 * Minimal stand-in for the PostgREST query builder: every filter call is
 * recorded and chains, and awaiting the query asks `respond` for the result.
 */
export type RecordedQuery = {
  table: string;
  calls: { method: string; args: unknown[] }[];
};

type Result = { data: unknown; error: { code: string } | null; count?: number | null };

export function fakeSupabase(
  respond: (query: RecordedQuery) => Result,
  options: { userId?: string } = {},
) {
  const queries: RecordedQuery[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.userId ? { id: options.userId } : null },
        error: null,
      }),
    },
    from(table: string) {
      return record({ table, calls: [] });
    },
    /** Recorded as table "rpc:<name>" with an "rpc" call holding the arguments. */
    rpc(name: string, args?: unknown) {
      return record({ table: `rpc:${name}`, calls: [{ method: "rpc", args: [args] }] });
    },
  };

  function record(query: RecordedQuery) {
    queries.push(query);
    const builder: Record<string, unknown> = {};
    const chain = new Proxy(builder, {
      get(_target, method: string) {
        if (method === "then") {
          return (resolve: (value: Result) => void) => resolve(respond(query));
        }
        return (...args: unknown[]) => {
          query.calls.push({ method, args });
          return chain;
        };
      },
    });
    return chain;
  }
  return { client, queries };
}

export const argsOf = (query: RecordedQuery, method: string) =>
  query.calls.find((call) => call.method === method)?.args;
