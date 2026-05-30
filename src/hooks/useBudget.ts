"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createBudgetNextMonthFromSource,
  createBudgetLine,
  getBudgetYears,
  getBudgetLines,
  getBudgetSummaryVsActual,
  getBudgetSummaryVsActualForRange,
  getOrCreateBudgetYear,
  ensureBudgetSeed,
  getBudgetCategories,
  upsertBudgetMonthPlan,
  updateBudgetLine,
  deleteBudgetLine,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/actions/budget";
import type {
  BudgetCategory,
  BudgetLineWithPlan,
  BudgetSummaryVsActual,
} from "@/types/budget";
import type {
  CreateBudgetNextMonthFromSourceInput,
  CreateBudgetLineInput,
  CreateCategoryInput,
  UpsertBudgetMonthPlanInput,
  UpdateBudgetLineInput,
  UpdateCategoryInput,
} from "@/lib/validations/budget.schema";
import { toast } from "sonner";

export const BUDGET_KEYS = {
  years: ["budget", "years"] as const,
  categories: ["budget", "categories"] as const,
  lines: (monthId: string) => ["budget", "lines", monthId] as const,
  summary: (monthId: string) => ["budget", "summary", monthId] as const,
  summaryRange: (startMonthId: string, endMonthId: string) =>
    ["budget", "summary-range", startMonthId, endMonthId] as const,
};

export function useBudgetYears() {
  return useQuery({
    queryKey: BUDGET_KEYS.years,
    queryFn: async () => {
      const result = await getBudgetYears();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useOrCreateBudgetYear(year: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (y?: number) => {
      const yr = y ?? year;
      if (yr == null) throw new Error("Año requerido");
      const result = await getOrCreateBudgetYear(yr);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.years });
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
    },
  });
}

export function useEnsureBudgetSeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await ensureBudgetSeed();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
    },
  });
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: BUDGET_KEYS.categories,
    queryFn: async () => {
      const result = await getBudgetCategories();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
  });
}

export function useSuspenseBudgetCategories() {
  return useSuspenseQuery({
    queryKey: BUDGET_KEYS.categories,
    queryFn: async () => {
      const result = await getBudgetCategories();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCategoryInput) => {
      const result = await createCategory(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (newCat) => {
      await queryClient.cancelQueries({ queryKey: BUDGET_KEYS.categories });
      const previous = queryClient.getQueryData<BudgetCategory[]>(
        BUDGET_KEYS.categories
      );
      queryClient.setQueryData<BudgetCategory[]>(
        BUDGET_KEYS.categories,
        (old) => [
          ...(old ?? []),
          {
            id: `temp-${Date.now()}`,
            user_id: "",
            category_type: newCat.category_type,
            name: newCat.name,
            monthly_amount: newCat.monthly_amount ?? 0,
            display_order: newCat.display_order ?? 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BUDGET_KEYS.categories, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Categoría creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCategoryInput) => {
      const result = await updateCategory(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (updatedCat) => {
      await queryClient.cancelQueries({ queryKey: BUDGET_KEYS.categories });
      const previous = queryClient.getQueryData<BudgetCategory[]>(
        BUDGET_KEYS.categories
      );
      queryClient.setQueryData<BudgetCategory[]>(
        BUDGET_KEYS.categories,
        (old) =>
          (old ?? []).map((cat) =>
            cat.id === updatedCat.id
              ? { ...cat, ...updatedCat, updated_at: new Date().toISOString() }
              : cat
          )
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BUDGET_KEYS.categories, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Categoría actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteCategory(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: BUDGET_KEYS.categories });
      const previous = queryClient.getQueryData<BudgetCategory[]>(
        BUDGET_KEYS.categories
      );
      queryClient.setQueryData<BudgetCategory[]>(
        BUDGET_KEYS.categories,
        (old) => (old ?? []).filter((cat) => cat.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BUDGET_KEYS.categories, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Categoría eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
    },
  });
}

export function useBudgetLines(monthId: string | null) {
  return useQuery<BudgetLineWithPlan[]>({
    queryKey: BUDGET_KEYS.lines(monthId ?? ""),
    enabled: !!monthId,
    queryFn: async () => {
      if (!monthId) return [];
      const result = await getBudgetLines(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSuspenseBudgetLines(monthId: string) {
  return useSuspenseQuery<BudgetLineWithPlan[]>({
    queryKey: BUDGET_KEYS.lines(monthId),
    queryFn: async () => {
      const result = await getBudgetLines(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateBudgetLine(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBudgetLineInput) => {
      const result = await createBudgetLine(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: BUDGET_KEYS.categories });
      if (monthId) {
        await queryClient.cancelQueries({
          queryKey: BUDGET_KEYS.lines(monthId),
        });
      }
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Línea creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
      if (monthId) {
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.lines(monthId),
        });
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.summary(monthId),
        });
      }
    },
  });
}

export function useUpdateBudgetLine(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBudgetLineInput) => {
      const result = await updateBudgetLine(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: BUDGET_KEYS.categories });
      if (monthId) {
        await queryClient.cancelQueries({
          queryKey: BUDGET_KEYS.lines(monthId),
        });
      }
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Línea actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
      if (monthId) {
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.lines(monthId),
        });
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.summary(monthId),
        });
      }
    },
  });
}

export function useDeleteBudgetLine(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteBudgetLine(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      if (monthId) {
        await queryClient.cancelQueries({
          queryKey: BUDGET_KEYS.lines(monthId),
        });
        const previous = queryClient.getQueryData<BudgetLineWithPlan[]>(
          BUDGET_KEYS.lines(monthId)
        );
        queryClient.setQueryData<BudgetLineWithPlan[]>(
          BUDGET_KEYS.lines(monthId),
          (old) => (old ?? []).filter((line) => line.id !== id)
        );
        return { previous };
      }
    },
    onError: (_err, _id, context) => {
      if (context?.previous && monthId) {
        queryClient.setQueryData(BUDGET_KEYS.lines(monthId), context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Línea eliminada");
    },
    onSettled: () => {
      if (monthId) {
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.lines(monthId),
        });
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.summary(monthId),
        });
      }
    },
  });
}

export function useUpsertBudgetMonthPlan(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertBudgetMonthPlanInput) => {
      const result = await upsertBudgetMonthPlan(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (input) => {
      const targetMonthId = input.month_id;

      // Cancel both lines and summary queries
      await queryClient.cancelQueries({
        queryKey: BUDGET_KEYS.lines(targetMonthId),
      });
      await queryClient.cancelQueries({
        queryKey: BUDGET_KEYS.summary(targetMonthId),
      });

      // Snapshot previous state for rollback
      const previousLines = queryClient.getQueryData<BudgetLineWithPlan[]>(
        BUDGET_KEYS.lines(targetMonthId)
      );
      const previousSummary = queryClient.getQueryData<BudgetSummaryVsActual>(
        BUDGET_KEYS.summary(targetMonthId)
      );

      // Optimistically update lines cache
      queryClient.setQueryData<BudgetLineWithPlan[]>(
        BUDGET_KEYS.lines(targetMonthId),
        (old) =>
          (old ?? []).map((line) =>
            line.id === input.line_id
              ? { ...line, planned_amount: input.planned_amount }
              : line
          )
      );

      // Optimistically update summary cache (totals + category row)
      if (previousLines) {
        const updatedLine = previousLines.find((l) => l.id === input.line_id);
        if (updatedLine) {
          const oldPlanned = updatedLine.planned_amount;
          const diff = input.planned_amount - oldPlanned;

          queryClient.setQueryData<BudgetSummaryVsActual>(
            BUDGET_KEYS.summary(targetMonthId),
            (old) => {
              if (!old) return old;
              return {
                totals: {
                  ...old.totals,
                  planned: old.totals.planned + diff,
                  variance: old.totals.variance + diff,
                },
                categories: old.categories.map((cat) =>
                  cat.category_id === updatedLine.category_id
                    ? {
                        ...cat,
                        planned_amount: cat.planned_amount + diff,
                        variance: cat.variance + diff,
                      }
                    : cat
                ),
              };
            }
          );
        }
      }

      return { previousLines, previousSummary, targetMonthId };
    },
    onError: (_err, _input, context) => {
      if (context?.targetMonthId) {
        if (context.previousLines) {
          queryClient.setQueryData(
            BUDGET_KEYS.lines(context.targetMonthId),
            context.previousLines
          );
        }
        if (context.previousSummary) {
          queryClient.setQueryData(
            BUDGET_KEYS.summary(context.targetMonthId),
            context.previousSummary
          );
        }
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Plan mensual actualizado");
    },
    onSettled: (_, __, vars) => {
      queryClient.invalidateQueries({
        queryKey: BUDGET_KEYS.lines(vars.month_id),
      });
      queryClient.invalidateQueries({
        queryKey: BUDGET_KEYS.summary(vars.month_id),
      });
      if (monthId && monthId !== vars.month_id) {
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.lines(monthId),
        });
        queryClient.invalidateQueries({
          queryKey: BUDGET_KEYS.summary(monthId),
        });
      }
    },
  });
}

export function useCreateBudgetNextMonthFromSource(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: CreateBudgetNextMonthFromSourceInput["entries"]) => {
      if (!monthId) throw new Error("Mes requerido");
      const result = await createBudgetNextMonthFromSource({
        source_month_id: monthId,
        entries,
      });
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["months"] });
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(data.month_id) });
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(data.month_id) });
      toast.success(
        `Presupuesto ${data.month}/${data.year} creado desde el mes actual`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBudgetSummary(monthId: string | null) {
  return useQuery<BudgetSummaryVsActual>({
    queryKey: BUDGET_KEYS.summary(monthId ?? ""),
    enabled: !!monthId,
    queryFn: async () => {
      if (!monthId) {
        return {
          totals: { planned: 0, actual: 0, variance: 0 },
          categories: [],
        };
      }
      const result = await getBudgetSummaryVsActual(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useSuspenseBudgetSummary(monthId: string) {
  return useSuspenseQuery<BudgetSummaryVsActual>({
    queryKey: BUDGET_KEYS.summary(monthId),
    queryFn: async () => {
      const result = await getBudgetSummaryVsActual(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useBudgetSummaryForRange(
  startMonthId: string | null,
  endMonthId: string | null
) {
  return useQuery<BudgetSummaryVsActual>({
    queryKey: BUDGET_KEYS.summaryRange(startMonthId ?? "", endMonthId ?? ""),
    enabled: !!startMonthId && !!endMonthId,
    queryFn: async () => {
      if (!startMonthId || !endMonthId) {
        return {
          totals: { planned: 0, actual: 0, variance: 0 },
          categories: [],
        };
      }
      const result = await getBudgetSummaryVsActualForRange(
        startMonthId,
        endMonthId,
      );
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}
