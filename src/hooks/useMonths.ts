"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createNextMonthFromLatest,
  getMonths,
  getOrCreateCurrentMonth,
  previewNextMonthFromLatest,
} from "@/actions/months";
import { invalidateLedger } from "@/lib/query-keys";
import { toast } from "sonner";

export const MONTH_KEYS = {
  all: ["months"] as const,
};

export function useMonths() {
  return useQuery({
    queryKey: MONTH_KEYS.all,
    queryFn: async () => {
      const result = await getMonths();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useSuspenseMonths() {
  return useSuspenseQuery({
    queryKey: MONTH_KEYS.all,
    queryFn: async () => {
      const result = await getMonths();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useEnsureCurrentMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await getOrCreateCurrentMonth();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      invalidateLedger(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCreateNextMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await createNextMonthFromLatest();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      invalidateLedger(queryClient);
      toast.success("Mes creado y saldos arrastrados correctamente");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function usePreviewNextMonth() {
  return useMutation({
    mutationFn: async () => {
      const result = await previewNextMonthFromLatest();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

