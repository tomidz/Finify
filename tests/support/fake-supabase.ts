/**
 * Minimal stand-in for the PostgREST query builder: every filter call is
 * recorded and chains, and awaiting the query asks `respond` for the result.
 */
export type RecordedQuery = {
  table: string;
  calls: { method: string; args: unknown[] }[];
};

type Result = { data: unknown; error: { code: string } | null; count?: number | null };

export function fakeSupabase(respond: (query: RecordedQuery) => Result) {
  const queries: RecordedQuery[] = [];
  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, calls: [] };
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
    },
  };
  return { client, queries };
}

export const argsOf = (query: RecordedQuery, method: string) =>
  query.calls.find((call) => call.method === method)?.args;
