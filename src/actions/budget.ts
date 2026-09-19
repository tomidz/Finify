"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateBudgetNextMonthFromSourceSchema,
  CreateBudgetLineSchema,
  CreateBudgetYearSchema,
  CreateCategorySchema,
  UpsertBudgetMonthPlanSchema,
  UpdateBudgetLineSchema,
  UpdateCategorySchema,
} from "@/lib/validations/budget.schema";
import { createMonth } from "@/actions/months";
import { loadBudgetSummaryRange } from "@/lib/server/budget";
import { getServerContext } from "@/lib/server/context";
import type {
  BudgetCategory,
  BudgetLine,
  BudgetLineWithPlan,
  BudgetMonthPlan,
  BudgetSummaryVsActual,
  BudgetYear,
} from "@/types/budget";
import { budgetTotalsByGroup } from "@/lib/finance/budget-status";
import type { ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { dbError } from "@/lib/server/db-errors";

type MonthLite = {
  id: string;
  year: number;
  month: number;
};

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user.id;
}

function addMonths(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + offset;
  return {
    year: Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

async function getMonthForUser(
  userId: string,
  monthId: string,
): Promise<ActionResult<MonthLite>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("months")
    .select("id, year, month")
    .eq("user_id", userId)
    .eq("id", monthId)
    .maybeSingle();
  if (error) return dbError("getMonthForUser", error, "Error al obtener el mes");
  if (!data) return { error: "Mes no encontrado" };
  return { data };
}

// --- SEED: solo user_preferences para usuarios existentes (no sobrescribe si ya existen) ---
export async function ensureBudgetSeed(): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) return dbError("ensureBudgetSeed", existingError, "Error al cargar preferencias");
    if (existing) return { data: null };

    const { error } = await supabase.from("user_preferences").insert({
      user_id: userId,
      base_currency: "USD",
      fx_source: "frankfurter",
    });

    if (error) return dbError("ensureBudgetSeed", error, "Error al cargar preferencias");
    return { data: null };
  } catch (e) {
    logError("ensureBudgetSeed", e);
    return { error: "Error al cargar preferencias" };
  }
}

// --- BUDGET YEARS ---
export async function getBudgetYears(): Promise<ActionResult<BudgetYear[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_years")
      .select("*")
      .eq("user_id", userId)
      .order("year", { ascending: false });

    if (error) return dbError("getBudgetYears", error, "Error al obtener los años");
    return { data: (data ?? []) as BudgetYear[] };
  } catch (e) {
    logError("getBudgetYears", e);
    return { error: "Error al obtener los años" };
  }
}

export async function getOrCreateBudgetYear(
  year: number,
): Promise<ActionResult<BudgetYear>> {
  try {
    const parsed = CreateBudgetYearSchema.safeParse({ year });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? "Año inválido" };

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("budget_years")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .maybeSingle();

    if (existingError) return dbError("getOrCreateBudgetYear", existingError, "Error al crear el año");
    if (existing) return { data: existing as BudgetYear };

    const { data: created, error } = await supabase
      .from("budget_years")
      .insert({ user_id: userId, year })
      .select()
      .single();

    if (error) return dbError("getOrCreateBudgetYear", error, "Error al crear el año");
    return { data: created as BudgetYear };
  } catch (e) {
    logError("getOrCreateBudgetYear", e);
    return { error: "Error al crear el año" };
  }
}

// --- BUDGET CATEGORIES (solo categorías, sin subcategorías) ---
export async function getBudgetCategories(): Promise<
  ActionResult<BudgetCategory[]>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_categories")
      .select("*")
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) return dbError("getBudgetCategories", error, "Error al obtener las categorías");
    return { data: (data ?? []) as BudgetCategory[] };
  } catch (e) {
    logError("getBudgetCategories", e);
    return { error: "Error al obtener las categorías" };
  }
}

export async function createCategory(
  input: unknown,
): Promise<ActionResult<BudgetCategory>> {
  try {
    const parsed = CreateCategorySchema.safeParse(input);
    if (!parsed.success)
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_categories")
      .insert({
        user_id: userId,
        category_type: parsed.data.category_type,
        name: parsed.data.name,
        monthly_amount: parsed.data.monthly_amount,
        display_order: parsed.data.display_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return { error: "Ya existe una categoría con ese nombre" };
      return dbError("createCategory", error, "Error al crear la categoría");
    }
    return { data: data as BudgetCategory };
  } catch (e) {
    logError("createCategory", e);
    return { error: "Error al crear la categoría" };
  }
}

export async function updateCategory(
  input: unknown,
): Promise<ActionResult<BudgetCategory>> {
  try {
    const parsed = UpdateCategorySchema.safeParse(input);
    if (!parsed.success)
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const { id, ...updates } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_categories")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return { error: "Ya existe una categoría con ese nombre" };
      return dbError("updateCategory", error, "Error al actualizar la categoría");
    }
    return { data: data as BudgetCategory };
  } catch (e) {
    logError("updateCategory", e);
    return { error: "Error al actualizar la categoría" };
  }
}

export async function deleteCategory(id: string): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_categories")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return dbError("deleteCategory", error, "Error al eliminar la categoría");
    return { data: null };
  } catch (e) {
    logError("deleteCategory", e);
    return { error: "Error al eliminar la categoría" };
  }
}

// --- BUDGET LINES + MONTH PLANS ---
export async function getBudgetLines(
  monthId: string,
): Promise<ActionResult<BudgetLineWithPlan[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const month = await getMonthForUser(userId, monthId);
    if ("error" in month) return month;

    const supabase = await createClient();
    const { data: lines, error: linesError } = await supabase
      .from("budget_lines")
      .select(
        `
        id, user_id, category_id, name, display_order, is_active, created_at, updated_at,
        budget_categories!inner(id, name, category_type)
      `,
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (linesError) return dbError("getBudgetLines", linesError, "Error al obtener líneas de presupuesto");
    if (!lines || lines.length === 0) return { data: [] };

    const lineIds = lines.map((line) => line.id);
    const { data: plans, error: plansError } = await supabase
      .from("budget_month_plans")
      .select("id, line_id, month_id, planned_amount")
      .eq("month_id", monthId)
      .in("line_id", lineIds);

    if (plansError) return dbError("getBudgetLines", plansError, "Error al obtener líneas de presupuesto");

    const planByLineId = new Map(
      (plans ?? []).map((plan) => [
        plan.line_id,
        {
          id: plan.id,
          month_id: plan.month_id,
          planned_amount: Number(plan.planned_amount),
        },
      ]),
    );

    const mapped = lines.map((line) => {
      const categoryRaw = line.budget_categories as
        | {
            id: string;
            name: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            category_type: any;
          }
        | {
            id: string;
            name: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            category_type: any;
          }[];
      const category = Array.isArray(categoryRaw)
        ? categoryRaw[0]
        : categoryRaw;
      const typedCategory = category as {
        id: string;
        name: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category_type: any;
      };
      const plan = planByLineId.get(line.id);
      return {
        id: line.id,
        user_id: line.user_id,
        category_id: line.category_id,
        name: line.name,
        display_order: line.display_order,
        is_active: line.is_active,
        created_at: line.created_at,
        updated_at: line.updated_at,
        category_name: typedCategory?.name ?? "Sin categoría",
        category_type: typedCategory?.category_type,
        month_id: monthId,
        plan_id: plan?.id ?? null,
        planned_amount: plan?.planned_amount ?? 0,
      };
    }) as BudgetLineWithPlan[];

    return { data: mapped };
  } catch (e) {
    logError("getBudgetLines", e);
    return { error: "Error al obtener líneas de presupuesto" };
  }
}

export async function createBudgetLine(
  input: unknown,
): Promise<ActionResult<BudgetLine>> {
  try {
    const parsed = CreateBudgetLineSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: category, error: categoryError } = await supabase
      .from("budget_categories")
      .select("id")
      .eq("id", parsed.data.category_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (categoryError) return dbError("createBudgetLine", categoryError, "Error al crear línea de presupuesto");
    if (!category) return { error: "Categoría no encontrada" };

    const { data, error } = await supabase
      .from("budget_lines")
      .insert({
        user_id: userId,
        category_id: parsed.data.category_id,
        name: parsed.data.name,
        display_order: parsed.data.display_order,
        is_active: parsed.data.is_active,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return { error: "Ya existe una línea con ese nombre en la categoría" };
      return dbError("createBudgetLine", error, "Error al crear línea de presupuesto");
    }

    return { data: data as BudgetLine };
  } catch (e) {
    logError("createBudgetLine", e);
    return { error: "Error al crear línea de presupuesto" };
  }
}

export async function updateBudgetLine(
  input: unknown,
): Promise<ActionResult<BudgetLine>> {
  try {
    const parsed = UpdateBudgetLineSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { id, ...updates } = parsed.data;

    if (updates.category_id) {
      const { data: category, error: categoryError } = await supabase
        .from("budget_categories")
        .select("id")
        .eq("id", updates.category_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (categoryError) return dbError("updateBudgetLine", categoryError, "Error al actualizar línea de presupuesto");
      if (!category) return { error: "Categoría no encontrada" };
    }

    const { data, error } = await supabase
      .from("budget_lines")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return { error: "Ya existe una línea con ese nombre en la categoría" };
      return dbError("updateBudgetLine", error, "Error al actualizar línea de presupuesto");
    }
    return { data: data as BudgetLine };
  } catch (e) {
    logError("updateBudgetLine", e);
    return { error: "Error al actualizar línea de presupuesto" };
  }
}

export async function deleteBudgetLine(
  id: string,
): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_lines")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return dbError("deleteBudgetLine", error, "Error al eliminar línea de presupuesto");
    return { data: null };
  } catch (e) {
    logError("deleteBudgetLine", e);
    return { error: "Error al eliminar línea de presupuesto" };
  }
}

export async function upsertBudgetMonthPlan(
  input: unknown,
): Promise<ActionResult<BudgetMonthPlan>> {
  try {
    const parsed = UpsertBudgetMonthPlanSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("id", parsed.data.line_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lineError) return dbError("upsertBudgetMonthPlan", lineError, "Error al guardar plan mensual");
    if (!line) return { error: "Línea de presupuesto no encontrada" };

    const month = await getMonthForUser(userId, parsed.data.month_id);
    if ("error" in month) return month;

    const { data, error } = await supabase
      .from("budget_month_plans")
      .upsert(
        {
          line_id: parsed.data.line_id,
          month_id: parsed.data.month_id,
          planned_amount: parsed.data.planned_amount,
        },
        { onConflict: "line_id,month_id" },
      )
      .select()
      .single();

    if (error) return dbError("upsertBudgetMonthPlan", error, "Error al guardar plan mensual");
    return {
      data: {
        ...data,
        planned_amount: Number(data.planned_amount),
      } as BudgetMonthPlan,
    };
  } catch (e) {
    logError("upsertBudgetMonthPlan", e);
    return { error: "Error al guardar plan mensual" };
  }
}

export async function createBudgetNextMonthFromSource(input: unknown): Promise<
  ActionResult<{
    month_id: string;
    year: number;
    month: number;
    copied_lines: number;
  }>
> {
  try {
    const parsed = CreateBudgetNextMonthFromSourceSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const sourceMonth = await getMonthForUser(
      userId,
      parsed.data.source_month_id,
    );
    if ("error" in sourceMonth) return sourceMonth;

    const targetDate = addMonths(
      sourceMonth.data.year,
      sourceMonth.data.month,
      1,
    );
    const createdMonth = await createMonth(targetDate.year, targetDate.month);
    if ("error" in createdMonth) return { error: createdMonth.error };

    const supabase = await createClient();
    const entryCategoryIds = Array.from(
      new Set(parsed.data.entries.map((entry) => entry.category_id)),
    );

    const { data: categories, error: categoriesError } = await supabase
      .from("budget_categories")
      .select("id, name, display_order")
      .eq("user_id", userId)
      .in("id", entryCategoryIds);
    if (categoriesError) return dbError("createBudgetNextMonthFromSource", categoriesError, "Error al crear presupuesto del mes siguiente");

    const validCategoryIds = new Set((categories ?? []).map((c) => c.id));
    if (validCategoryIds.size !== entryCategoryIds.length) {
      return { error: "Alguna categoría no es válida" };
    }

    const { data: lines, error: linesError } = await supabase
      .from("budget_lines")
      .select("id, category_id, display_order, name")
      .eq("user_id", userId)
      .in("category_id", entryCategoryIds)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (linesError) return dbError("createBudgetNextMonthFromSource", linesError, "Error al crear presupuesto del mes siguiente");

    const primaryLineByCategoryId = new Map<string, string>();
    for (const line of lines ?? []) {
      if (!primaryLineByCategoryId.has(line.category_id)) {
        primaryLineByCategoryId.set(line.category_id, line.id);
      }
    }

    const missingCategories = (categories ?? []).filter(
      (category) => !primaryLineByCategoryId.has(category.id),
    );
    if (missingCategories.length > 0) {
      const { error: insertLinesError } = await supabase
        .from("budget_lines")
        .insert(
          missingCategories.map((category) => ({
            user_id: userId,
            category_id: category.id,
            name: category.name,
            display_order: category.display_order ?? 0,
            is_active: true,
          })),
        );
      if (insertLinesError) return dbError("createBudgetNextMonthFromSource", insertLinesError, "Error al crear presupuesto del mes siguiente");

      const { data: refreshedLines, error: refreshedLinesError } =
        await supabase
          .from("budget_lines")
          .select("id, category_id, display_order, name")
          .eq("user_id", userId)
          .in("category_id", entryCategoryIds)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });
      if (refreshedLinesError) return dbError("createBudgetNextMonthFromSource", refreshedLinesError, "Error al crear presupuesto del mes siguiente");

      primaryLineByCategoryId.clear();
      for (const line of refreshedLines ?? []) {
        if (!primaryLineByCategoryId.has(line.category_id)) {
          primaryLineByCategoryId.set(line.category_id, line.id);
        }
      }
    }

    const { data: allUserLines, error: allLinesError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("user_id", userId);
    if (allLinesError) return dbError("createBudgetNextMonthFromSource", allLinesError, "Error al crear presupuesto del mes siguiente");

    const allUserLineIds = (allUserLines ?? []).map((line) => line.id);
    if (allUserLineIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("budget_month_plans")
        .delete()
        .eq("month_id", createdMonth.data.id)
        .in("line_id", allUserLineIds);
      if (deleteError) return dbError("createBudgetNextMonthFromSource", deleteError, "Error al crear presupuesto del mes siguiente");
    }

    // Dedupe by line: duplicate category entries used to violate
    // UNIQUE(line_id, month_id) AFTER the delete above, leaving the target
    // month with zero plans. Upsert keeps the write idempotent regardless.
    const rowsByLine = new Map<string, {
      line_id: string;
      month_id: string;
      planned_amount: number;
    }>();
    for (const entry of parsed.data.entries) {
      const lineId = primaryLineByCategoryId.get(entry.category_id);
      if (!lineId) continue;
      rowsByLine.set(lineId, {
        line_id: lineId,
        month_id: createdMonth.data.id,
        planned_amount: entry.planned_amount,
      });
    }
    const rowsToInsert = [...rowsByLine.values()];

    if (rowsToInsert.length > 0) {
      const { error: insertPlansError } = await supabase
        .from("budget_month_plans")
        .upsert(rowsToInsert, { onConflict: "line_id,month_id" });
      if (insertPlansError) return dbError("createBudgetNextMonthFromSource", insertPlansError, "Error al crear presupuesto del mes siguiente");
    }

    return {
      data: {
        month_id: createdMonth.data.id,
        year: createdMonth.data.year,
        month: createdMonth.data.month,
        copied_lines: rowsToInsert.length,
      },
    };
  } catch (e) {
    logError("createBudgetNextMonthFromSource", e);
    return { error: "Error al crear presupuesto del mes siguiente" };
  }
}

// --- SUMMARY: PLAN VS REAL ---
export async function getBudgetSummaryVsActual(
  monthId: string,
): Promise<ActionResult<BudgetSummaryVsActual>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const month = await getMonthForUser(userId, monthId);
    if ("error" in month) return month;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("budget_summary_vs_actual", {
      p_month_id: monthId,
      p_base_currency: undefined,
    });

    if (error) return dbError("getBudgetSummaryVsActual", error, "Error al obtener resumen plan vs real");

    const categorySummary = ((data ?? []) as Array<{
      category_id: string;
      category_name: string;
      category_type: BudgetSummaryVsActual["categories"][number]["category_type"];
      planned_amount: number | string | null;
      actual_amount: number | string | null;
      variance: number | string | null;
    }>).map((category) => ({
      category_id: category.category_id,
      category_name: category.category_name,
      category_type: category.category_type,
      planned_amount: Number(category.planned_amount ?? 0),
      actual_amount: Number(category.actual_amount ?? 0),
      variance: Number(category.variance ?? 0),
    }));

    return {
      data: {
        totals: budgetTotalsByGroup(categorySummary),
        categories: categorySummary,
      },
    };
  } catch (e) {
    logError("getBudgetSummaryVsActual", e);
    return { error: "Error al obtener resumen plan vs real" };
  }
}

export async function getBudgetSummaryVsActualForRange(
  startMonthId: string,
  endMonthId: string,
): Promise<ActionResult<BudgetSummaryVsActual>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    const startMonth = await getMonthForUser(ctx.userId, startMonthId);
    if ("error" in startMonth) return startMonth;
    const endMonth = await getMonthForUser(ctx.userId, endMonthId);
    if ("error" in endMonth) return endMonth;
    return await loadBudgetSummaryRange(ctx, startMonthId, endMonthId);
  } catch (e) {
    logError("getBudgetSummaryVsActualForRange", e);
    return { error: "Error al obtener resumen plan vs real" };
  }
}
