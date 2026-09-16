import "server-only";

import { toYearMonthCode } from "@/lib/months";
import type { ServerContext } from "@/lib/server/context";
import type { Month } from "@/types/months";

type Result<T> = { data: T } | { error: string };

/** Months between two month ids (inclusive, chronological), in one query. */
export async function loadMonthsInRange(
  { supabase, userId }: ServerContext,
  startMonthId: string,
  endMonthId: string,
): Promise<Result<Month[]>> {
  const { data, error } = await supabase
    .from("months")
    .select("*")
    .eq("user_id", userId)
    .order("year", { ascending: true })
    .order("month", { ascending: true });
  if (error) return { error: error.message };

  const months = (data ?? []) as Month[];
  const start = months.find((m) => m.id === startMonthId);
  if (!start) return { error: "Mes inicial no encontrado" };
  const end = months.find((m) => m.id === endMonthId);
  if (!end) return { error: "Mes final no encontrado" };

  const startCode = toYearMonthCode(start.year, start.month);
  const endCode = toYearMonthCode(end.year, end.month);
  if (startCode > endCode) {
    return { error: "El mes inicial debe ser anterior al final" };
  }

  return {
    data: months.filter((m) => {
      const code = toYearMonthCode(m.year, m.month);
      return code >= startCode && code <= endCode;
    }),
  };
}

/** All of the user's months, newest first. */
export async function loadMonths({
  supabase,
  userId,
}: ServerContext): Promise<Result<Month[]>> {
  const { data, error } = await supabase
    .from("months")
    .select("*")
    .eq("user_id", userId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) return { error: error.message };
  return { data: (data ?? []) as Month[] };
}
