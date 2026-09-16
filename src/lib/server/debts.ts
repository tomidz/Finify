import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Get the current balance for a single debt item (carry-forward).
 * Used internally by debt activity actions to compute new balance.
 */
export async function getDebtCurrentBalance(
  nwItemId: string,
  year: number,
  month: number
): Promise<number> {
  const supabase = await createClient();

  // Try same year first
  const { data: sameYear } = await supabase
    .from("nw_snapshots")
    .select("amount")
    .eq("nw_item_id", nwItemId)
    .eq("year", year)
    .lte("month", month)
    .order("month", { ascending: false })
    .limit(1);

  if (sameYear && sameYear.length > 0) return Number(sameYear[0].amount);

  // Fallback to previous years
  const { data: prevYear } = await supabase
    .from("nw_snapshots")
    .select("amount")
    .eq("nw_item_id", nwItemId)
    .lt("year", year)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1);

  return prevYear && prevYear.length > 0 ? Number(prevYear[0].amount) : 0;
}
