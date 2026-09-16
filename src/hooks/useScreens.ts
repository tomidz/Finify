"use client";

import { useEffect } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { getDashboardData, getNetWorthData } from "@/actions/screens";

export const SCREEN_KEYS = {
  dashboard: (startMonthId: string | null, endMonthId: string | null) =>
    ["dashboard", startMonthId ?? "latest", endMonthId ?? "latest"] as const,
  netWorth: (year: number | null) =>
    ["net-worth", "screen", year ?? "latest"] as const,
};

/**
 * Screens load in one server round trip; the lookups they already carry
 * (months, currencies, base currency) are written into the cache so other
 * screens and dialogs don't fetch them again.
 */
function useSeedSharedLookups(
  data:
    | { months: unknown; currencies: unknown; baseCurrency: string }
    | undefined,
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!data) return;
    queryClient.setQueryData(["months"], data.months);
    queryClient.setQueryData(["currencies"], data.currencies);
    queryClient.setQueryData(["preferences", "base-currency"], data.baseCurrency);
  }, [data, queryClient]);
}

export function useDashboardData(
  startMonthId: string | null,
  endMonthId: string | null,
) {
  const query = useQuery({
    queryKey: SCREEN_KEYS.dashboard(startMonthId, endMonthId),
    queryFn: async () => {
      const result = await getDashboardData({ startMonthId, endMonthId });
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    placeholderData: keepPreviousData,
  });
  useSeedSharedLookups(query.data);
  return query;
}

export function useNetWorthData(year: number | null) {
  const query = useQuery({
    queryKey: SCREEN_KEYS.netWorth(year),
    queryFn: async () => {
      const result = await getNetWorthData({ year });
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    placeholderData: keepPreviousData,
  });
  useSeedSharedLookups(query.data);
  return query;
}
