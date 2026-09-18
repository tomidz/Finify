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
import { errorMessage, unwrapResult } from "@/lib/action-result";

export const MONTH_KEYS = {
  all: ["months"] as const,
};

export function useMonths() {
  return useQuery({
    queryKey: MONTH_KEYS.all,
    queryFn: async () => unwrapResult(await getMonths()),
    staleTime: 10 * 60_000,
  });
}

export function useSuspenseMonths() {
  return useSuspenseQuery({
    queryKey: MONTH_KEYS.all,
    queryFn: async () => unwrapResult(await getMonths()),
    staleTime: 10 * 60_000,
  });
}

export function useEnsureCurrentMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrapResult(await getOrCreateCurrentMonth()),
    onSuccess: () => {
      invalidateLedger(queryClient);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useCreateNextMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrapResult(await createNextMonthFromLatest()),
    onSuccess: () => {
      invalidateLedger(queryClient);
      toast.success("Mes creado y saldos arrastrados correctamente");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function usePreviewNextMonth() {
  return useMutation({
    mutationFn: async () => unwrapResult(await previewNextMonthFromLatest()),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

