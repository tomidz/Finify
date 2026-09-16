import "server-only";

type PageError = { code: string; message: string };
type Page<T> = { data: T[] | null; error: PageError | null; count?: number | null };

const PAGE_SIZE = 1000;

// `.in()` values travel in the URL; long lists are split into several reads.
export const IN_LIST_CHUNK = 50;

/**
 * Every row of a query, one page at a time. PostgREST caps each response at
 * the server's `max_rows`, which can be lower than the page asked for, so a
 * short page does not prove the end: the first page also asks for the exact
 * total. `query` must order by a unique key, or pages can overlap.
 */
export async function readAllRows<T>(
  query: (page: { from: number; to: number; count: "exact" | undefined }) => PromiseLike<Page<T>>,
): Promise<{ data: T[] } | { error: PageError }> {
  const rows: T[] = [];
  let total: number | null = null;
  for (;;) {
    const first = rows.length === 0;
    const { data, error, count } = await query({
      from: rows.length,
      to: rows.length + PAGE_SIZE - 1,
      count: first ? "exact" : undefined,
    });
    if (error) return { error };
    if (first) total = count ?? null;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (total != null && rows.length >= total) break;
  }
  return { data: rows };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
