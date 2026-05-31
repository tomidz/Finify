"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrFetchFxRate } from "@/actions/fx";
import { createMonth, recalculateOpeningBalances } from "@/actions/months";
import {
  CreateInvestmentSchema,
  SellInvestmentSchema,
  TransferInvestmentPositionSchema,
  UpdateInvestmentSchema,
} from "@/lib/validations/investment.schema";
import type {
  Investment,
  InvestmentSale,
  InvestmentSaleWithAccount,
  InvestmentWithAccount,
  AssetType,
} from "@/types/investments";
import { fetchCryptoPrices } from "@/lib/coingecko";
import {
  fetchTwelveDataInstrument,
  fetchTwelveDataPrices,
} from "@/lib/twelvedata";

type ActionResult<T> = { data: T } | { error: string };

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export async function getInvestments(): Promise<
  ActionResult<InvestmentWithAccount[]>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("investments")
      .select(
        `
        *,
        accounts ( name, account_type ),
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .order("purchase_date", { ascending: false });

    if (error) return { error: error.message };

    const mapped = (data ?? []).map((row) => {
      const accountRaw = row.accounts;
      const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const currencyRaw = row.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;

      return {
        id: row.id,
        user_id: row.user_id,
        account_id: row.account_id,
        asset_name: row.asset_name,
        ticker: row.ticker,
        isin: row.isin,
        asset_type: row.asset_type as AssetType,
        quantity: Number(row.quantity),
        price_per_unit: Number(row.price_per_unit),
        total_cost: Number(row.total_cost),
        currency: row.currency,
        purchase_date: row.purchase_date,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
        account_name: (account as { name?: string })?.name ?? "",
        account_type:
          (account as { account_type?: string })?.account_type ?? "",
        currency_symbol:
          (currency as { symbol?: string })?.symbol ?? row.currency,
      } as InvestmentWithAccount;
    });

    return { data: mapped };
  } catch {
    return { error: "Error al obtener inversiones" };
  }
}

export async function createInvestment(
  input: unknown
): Promise<ActionResult<Investment>> {
  try {
    const parsed = CreateInvestmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    // Verificar que la cuenta pertenece al usuario
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("id, account_type, currency")
      .eq("id", parsed.data.account_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (accError) return { error: accError.message };
    if (!account) return { error: "Cuenta no encontrada" };

    // Crear inversión
    const { data, error } = await supabase
      .from("investments")
      .insert({
        user_id: userId,
        account_id: parsed.data.account_id,
        asset_name: parsed.data.asset_name,
        ticker: parsed.data.ticker ?? null,
        isin: parsed.data.isin ?? null,
        asset_type: parsed.data.asset_type,
        quantity: parsed.data.quantity,
        price_per_unit: parsed.data.price_per_unit,
        total_cost: parsed.data.total_cost,
        currency: parsed.data.currency,
        purchase_date: parsed.data.purchase_date,
        notes: parsed.data.notes ?? null,
      })
      .select()
      .single();

    if (error) return { error: error.message };

    // Auto-descuento para brokers y para exchanges/wallets cuando se paga
    // con cash en la misma moneda que la cuenta (compra real, no transferencia entrante)
    const eligibleForDeduction =
      account.account_type === "investment_broker" ||
      ((account.account_type === "crypto_exchange" ||
        account.account_type === "crypto_wallet") &&
        account.currency === parsed.data.currency);

    if (eligibleForDeduction && !parsed.data.skip_deduction) {
      const deductionError = await autoDeductFromAccount(
        supabase,
        userId,
        parsed.data.account_id,
        account.currency,
        parsed.data.total_cost,
        parsed.data.currency,
        parsed.data.purchase_date,
        parsed.data.asset_name,
        data.id,
      );
      if (deductionError) {
        console.warn("Auto-deduction failed:", deductionError);
      }
    }

    return {
      data: {
        ...data,
        quantity: Number(data.quantity),
        price_per_unit: Number(data.price_per_unit),
        total_cost: Number(data.total_cost),
      } as Investment,
    };
  } catch {
    return { error: "Error al crear inversión" };
  }
}

async function autoDeductFromAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  accountId: string,
  accountCurrency: string,
  totalCost: number,
  investmentCurrency: string,
  date: string,
  assetName: string,
  investmentId: string,
): Promise<string | null> {
  try {
    // Resolver month_id para la fecha
    const parsedDate = new Date(`${date}T00:00:00`);
    const year = parsedDate.getFullYear();
    const month = parsedDate.getMonth() + 1;

    const { data: monthRow } = await supabase
      .from("months")
      .select("id")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (!monthRow) return null; // No month exists yet, skip deduction

    // Moneda base del usuario para FX correcto en base_amount
    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const baseCurrency = prefsRow?.base_currency ?? "USD";

    // El amount se registra en la moneda de la cuenta. base_amount va en moneda base.
    const amount = -Math.abs(totalCost);
    let exchangeRate = 1;
    let baseAmount = amount;
    if (accountCurrency !== baseCurrency) {
      const fxResult = await getOrFetchFxRate({
        date,
        from: accountCurrency,
        to: baseCurrency,
      });
      if ("error" in fxResult) return fxResult.error;
      exchangeRate = fxResult.data;
      baseAmount = Number((amount * fxResult.data).toFixed(4));
    }

    // Crear transacción tipo correction
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        month_id: monthRow.id,
        category_id: null,
        transaction_type: "correction",
        date,
        description: `Compra: ${assetName}`,
        notes: null,
        source_investment_id: investmentId,
      })
      .select()
      .single();

    if (txError) return txError.message;
    if (!tx) return "No se pudo crear la transacción de descuento";

    const { error: amountError } = await supabase.from("transaction_amounts").insert({
      transaction_id: tx.id,
      account_id: accountId,
      amount,
      original_currency: accountCurrency,
      exchange_rate: exchangeRate,
      base_amount: baseAmount,
    });

    if (amountError) {
      // Cleanup orphaned transaction
      await supabase.from("transactions").delete().eq("id", tx.id);
      return amountError.message;
    }

    await recalculateOpeningBalances(monthRow.id);

    return null;
  } catch (e) {
    console.error("autoDeductFromAccount:", e);
    return e instanceof Error ? e.message : "Error desconocido en auto-descuento";
  }
}

export async function updateInvestment(
  input: unknown
): Promise<ActionResult<Investment>> {
  try {
    const parsed = UpdateInvestmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { id, skip_deduction: _, ...updates } = parsed.data;
    const clean = Object.fromEntries(
      Object.entries(updates).filter(
        ([_, v]) => v !== undefined && v !== null
      )
    ) as Record<string, unknown>;

    const { data, error } = await supabase
      .from("investments")
      .update(clean)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return { error: error.message };

    // If total_cost or purchase_date changed, sync the linked auto-deduction
    // correction transaction to keep cash accounting honest.
    if (updates.total_cost !== undefined || updates.purchase_date !== undefined) {
      const { data: linkedTxs } = await supabase
        .from("transactions")
        .select("id, month_id, date")
        .eq("user_id", userId)
        .eq("source_investment_id", id);

      const newTotalCost = Number(data.total_cost);
      const accountCurrency = data.currency as string;

      const { data: prefsRow } = await supabase
        .from("user_preferences")
        .select("base_currency")
        .eq("user_id", userId)
        .maybeSingle();
      const baseCurrency = prefsRow?.base_currency ?? "USD";

      const monthsToRecalc = new Set<string>();
      for (const tx of linkedTxs ?? []) {
        const txDate = (updates.purchase_date ?? tx.date) as string;
        let exchangeRate = 1;
        let baseAmount = -Math.abs(newTotalCost);
        if (accountCurrency !== baseCurrency) {
          const fx = await getOrFetchFxRate({
            date: txDate,
            from: accountCurrency,
            to: baseCurrency,
          });
          if (!("error" in fx)) {
            exchangeRate = fx.data;
            baseAmount = Number((-Math.abs(newTotalCost) * fx.data).toFixed(4));
          }
        }

        await supabase
          .from("transaction_amounts")
          .update({
            amount: -Math.abs(newTotalCost),
            exchange_rate: exchangeRate,
            base_amount: baseAmount,
          })
          .eq("transaction_id", tx.id);

        if (updates.purchase_date && updates.purchase_date !== tx.date) {
          // Move the correction transaction to the new month if the purchase
          // date changed across month boundaries.
          const newMonthId = await resolveMonthForDate(supabase, userId, txDate);
          if (newMonthId && newMonthId !== tx.month_id) {
            await supabase
              .from("transactions")
              .update({ date: txDate, month_id: newMonthId })
              .eq("id", tx.id);
            monthsToRecalc.add(tx.month_id as string);
            monthsToRecalc.add(newMonthId);
          } else {
            await supabase
              .from("transactions")
              .update({ date: txDate })
              .eq("id", tx.id);
            monthsToRecalc.add(tx.month_id as string);
          }
        } else {
          monthsToRecalc.add(tx.month_id as string);
        }
      }

      const earliest = await pickEarliestMonth(supabase, [...monthsToRecalc]);
      if (earliest) {
        await recalculateOpeningBalances(earliest);
      }
    }

    return {
      data: {
        ...data,
        quantity: Number(data.quantity),
        price_per_unit: Number(data.price_per_unit),
        total_cost: Number(data.total_cost),
      } as Investment,
    };
  } catch {
    return { error: "Error al actualizar inversión" };
  }
}

async function resolveMonthForDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
): Promise<string | null> {
  const parsedDate = new Date(`${date}T00:00:00`);
  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth() + 1;
  const { data: row } = await supabase
    .from("months")
    .select("id")
    .eq("user_id", userId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  return row?.id ?? null;
}

async function pickEarliestMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  monthIds: string[],
): Promise<string | null> {
  if (monthIds.length === 0) return null;
  if (monthIds.length === 1) return monthIds[0];
  const { data } = await supabase
    .from("months")
    .select("id, year, month")
    .in("id", monthIds);
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort(
    (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
  );
  return sorted[0].id;
}

export async function deleteInvestment(
  id: string
): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    // Find and reverse the linked auto-deduction correction transaction (if any).
    // ON DELETE SET NULL on source_investment_id will null the FK *after* the
    // investment row is deleted, but we want to delete the correction outright.
    const { data: linkedTxs } = await supabase
      .from("transactions")
      .select("id, month_id")
      .eq("user_id", userId)
      .eq("source_investment_id", id);

    const monthsToRecalc = new Set<string>();
    for (const tx of linkedTxs ?? []) {
      monthsToRecalc.add(tx.month_id as string);
      await supabase.from("transactions").delete().eq("id", tx.id).eq("user_id", userId);
    }

    const { error } = await supabase
      .from("investments")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { error: error.message };

    const earliest = await pickEarliestMonth(supabase, [...monthsToRecalc]);
    if (earliest) {
      await recalculateOpeningBalances(earliest);
    }

    return { data: null };
  } catch {
    return { error: "Error al eliminar inversión" };
  }
}

export async function getCurrentInvestmentValuesByAccount(): Promise<
  ActionResult<Record<string, { current: number; cost: number }>>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();

    const baseCurrency = prefs?.base_currency ?? "USD";

    const investmentsResult = await getInvestments();
    if ("error" in investmentsResult) return investmentsResult;

    const investments = investmentsResult.data;
    if (investments.length === 0) return { data: {} };

    const grouped = new Map<
      string,
      {
        key: string;
        price_key: string;
        account_id: string;
        asset_type: string;
        currency: string;
        ticker: string;
        isin: string | null;
        quantity: number;
        total_cost: number;
      }
    >();

    for (const investment of investments) {
      const ticker = (investment.ticker ?? investment.asset_name).trim();
      const key = `${investment.account_id}::${ticker}`;
      const current = grouped.get(key) ?? {
        key,
        price_key: investment.ticker?.trim() || investment.isin?.trim() || investment.asset_name.trim(),
        account_id: investment.account_id,
        asset_type: investment.asset_type,
        currency: investment.currency,
        ticker,
        isin: investment.isin,
        quantity: 0,
        total_cost: 0,
      };
      current.quantity += investment.quantity;
      current.total_cost += investment.total_cost;
      grouped.set(key, current);
    }

    const priceMapResult = await fetchCurrentPrices(
      Array.from(
        new Map(
          Array.from(grouped.values()).map((holding) => [holding.price_key, {
            key: holding.price_key,
            ticker: holding.ticker,
            isin: holding.isin,
            assetType: holding.asset_type,
          }]),
        ).values(),
      ),
      baseCurrency,
    );

    if ("error" in priceMapResult) return priceMapResult;

    const prices = priceMapResult.data;
    const today = new Date().toISOString().slice(0, 10);
    const fxCache = new Map<string, number>();
    const totalsByAccount: Record<string, { current: number; cost: number }> = {};

    const add = (accountId: string, current: number, cost: number) => {
      const entry = totalsByAccount[accountId] ?? { current: 0, cost: 0 };
      entry.current += current;
      entry.cost += cost;
      totalsByAccount[accountId] = entry;
    };

    for (const holding of grouped.values()) {
      const marketPrice = prices[holding.price_key];

      if (marketPrice == null) {
        // No live price — treat current value as the cost basis (flat).
        add(holding.account_id, holding.total_cost, holding.total_cost);
        continue;
      }

      // Convert both the current value and the cost basis with the same factor
      // so they share a currency and the gain/loss % is meaningful.
      let factor = 1;
      if (holding.asset_type !== "crypto" && holding.currency !== baseCurrency) {
        const key = `${today}:${holding.currency}:${baseCurrency}`;
        let fxRate = fxCache.get(key);
        if (fxRate == null) {
          const fxResult = await getOrFetchFxRate({
            date: today,
            from: holding.currency,
            to: baseCurrency,
          });
          if ("error" in fxResult) return fxResult;
          fxRate = fxResult.data;
          fxCache.set(key, fxRate);
        }
        factor = fxRate;
      }

      add(
        holding.account_id,
        holding.quantity * marketPrice * factor,
        holding.total_cost * factor,
      );
    }

    return { data: totalsByAccount };
  } catch {
    return { error: "Error al obtener valor actual de inversiones" };
  }
}

export async function getCurrentInvestmentValuesByMonth(
  year: number,
): Promise<ActionResult<Record<number, { currentValue: number; costBasis: number }>>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();

    const baseCurrency = prefs?.base_currency ?? "USD";
    const investmentsResult = await getInvestments();
    if ("error" in investmentsResult) return investmentsResult;

    const investments = investmentsResult.data;
    if (investments.length === 0) return { data: {} };

    const priceMapResult = await fetchCurrentPrices(
      Array.from(
        new Map(
          investments.map((investment) => {
            const key = investment.ticker?.trim() || investment.isin?.trim() || investment.asset_name.trim();
            return [key, {
              key,
              ticker: investment.ticker,
              isin: investment.isin,
              assetType: investment.asset_type,
            }];
          }),
        ).values(),
      ),
      baseCurrency,
    );
    if ("error" in priceMapResult) return priceMapResult;

    const prices = priceMapResult.data;
    const totalsByMonth: Record<number, { currentValue: number; costBasis: number }> = {};
    const today = new Date().toISOString().slice(0, 10);
    const fxCache = new Map<string, number>();

    const monthSet = new Set<number>();
    for (const investment of investments) {
      const purchaseDate = new Date(`${investment.purchase_date}T00:00:00`);
      const purchaseYear = purchaseDate.getFullYear();
      const purchaseMonth = purchaseDate.getMonth() + 1;
      if (purchaseYear > year) continue;
      for (let month = purchaseYear < year ? 1 : purchaseMonth; month <= 12; month += 1) {
        monthSet.add(month);
      }
    }

    for (const month of monthSet) {
      totalsByMonth[month] = { currentValue: 0, costBasis: 0 };
    }

    for (const investment of investments) {
      const purchaseDate = new Date(`${investment.purchase_date}T00:00:00`);
      const purchaseYear = purchaseDate.getFullYear();
      const purchaseMonth = purchaseDate.getMonth() + 1;
      if (purchaseYear > year) continue;

      const priceKey = investment.ticker?.trim() || investment.isin?.trim() || investment.asset_name.trim();
      const price = prices[priceKey];

      let currentValue = price != null ? investment.quantity * price : investment.total_cost;
      let costBasis = investment.total_cost;

      if (investment.asset_type !== "crypto" && investment.currency !== baseCurrency) {
        const fxKey = `${today}:${investment.currency}:${baseCurrency}`;
        let fxRate = fxCache.get(fxKey);
        if (fxRate == null) {
          const fxResult = await getOrFetchFxRate({
            date: today,
            from: investment.currency,
            to: baseCurrency,
          });
          if ("error" in fxResult) return fxResult;
          fxRate = fxResult.data;
          fxCache.set(fxKey, fxRate);
        }
        // Both legs must be in base currency or the delta (gain/loss) is wrong.
        currentValue *= fxRate;
        costBasis *= fxRate;
      }

      const startMonth = purchaseYear < year ? 1 : purchaseMonth;
      for (let month = startMonth; month <= 12; month += 1) {
        totalsByMonth[month] = {
          currentValue: (totalsByMonth[month]?.currentValue ?? 0) + currentValue,
          costBasis: (totalsByMonth[month]?.costBasis ?? 0) + costBasis,
        };
      }
    }

    return { data: totalsByMonth };
  } catch {
    return { error: "Error al obtener valores actuales por mes" };
  }
}

export async function lookupInvestmentInstrument(input: {
  ticker?: string | null;
  isin?: string | null;
}): Promise<
  ActionResult<{
    ticker: string | null;
    asset_name: string | null;
    currency: string | null;
    price_per_unit: number | null;
  }>
> {
  try {
    const query = input.isin?.trim() || input.ticker?.trim();
    if (!query) return { error: "Ingresá un ticker o ISIN" };

    const instrument = await fetchTwelveDataInstrument(query);
    if (!instrument) return { error: "No se encontró el activo" };

    return {
      data: {
        ticker: instrument.symbol,
        asset_name: instrument.name,
        currency: instrument.currency,
        price_per_unit: instrument.price,
      },
    };
  } catch {
    return { error: "Error al buscar activo" };
  }
}

export async function transferInvestmentPosition(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const parsed = TransferInvestmentPositionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos invalidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, account_type, currency")
      .in("id", [
        parsed.data.source_account_id,
        parsed.data.destination_account_id,
      ])
      .eq("user_id", userId);

    if (accountsError) return { error: accountsError.message };
    if (!accounts || accounts.length !== 2) {
      return { error: "Cuenta origen o destino no encontrada" };
    }

    const allowedTypes = new Set([
      "investment_broker",
      "crypto_exchange",
      "crypto_wallet",
    ]);
    if (accounts.some((account) => !allowedTypes.has(account.account_type))) {
      return { error: "Solo se puede mover posicion entre cuentas de inversion" };
    }

    const { data: sourceLots, error: sourceError } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", parsed.data.source_account_id)
      .eq("asset_name", parsed.data.asset_name)
      .eq("asset_type", parsed.data.asset_type)
      .eq("currency", parsed.data.currency)
      .order("purchase_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (sourceError) return { error: sourceError.message };

    const matchingLots = (sourceLots ?? []).filter(
      (lot) =>
        (lot.ticker ?? null) === (parsed.data.ticker ?? null) &&
        (lot.isin ?? null) === (parsed.data.isin ?? null),
    );

    const availableQuantity = matchingLots.reduce(
      (sum, lot) => sum + Number(lot.quantity),
      0,
    );

    if (availableQuantity < parsed.data.quantity) {
      return { error: "No hay cantidad suficiente para transferir" };
    }

    // Network fee in asset units: the source loses the full quantity, the
    // destination receives quantity - fee_quantity, and the cost basis is
    // preserved on what arrives (per-unit cost rises, no realized loss).
    const feeFraction =
      parsed.data.quantity > 0
        ? parsed.data.fee_quantity / parsed.data.quantity
        : 0;

    let remainingQuantity = parsed.data.quantity;

    for (const lot of matchingLots) {
      if (remainingQuantity <= 0) break;

      const lotQuantity = Number(lot.quantity);
      const movedQuantity = Math.min(lotQuantity, remainingQuantity);
      const unitCost = lotQuantity > 0 ? Number(lot.total_cost) / lotQuantity : 0;
      const movedCost = Number((movedQuantity * unitCost).toFixed(8));
      const receivedQuantity = Number(
        (movedQuantity * (1 - feeFraction)).toFixed(8),
      );
      const remainingLotQuantity = Number((lotQuantity - movedQuantity).toFixed(8));
      const remainingLotCost = Number((Number(lot.total_cost) - movedCost).toFixed(8));

      if (receivedQuantity > 0.00000001) {
        const { error: insertError } = await supabase.from("investments").insert({
          user_id: userId,
          account_id: parsed.data.destination_account_id,
          asset_name: lot.asset_name,
          ticker: lot.ticker,
          isin: lot.isin,
          asset_type: lot.asset_type,
          quantity: receivedQuantity,
          price_per_unit: lot.price_per_unit,
          total_cost: movedCost,
          currency: lot.currency,
          purchase_date: parsed.data.transfer_date,
          notes: parsed.data.notes ?? `Transferido desde otra cuenta`,
        });

        if (insertError) return { error: insertError.message };
      }

      if (remainingLotQuantity <= 0.00000001) {
        const { error: deleteError } = await supabase
          .from("investments")
          .delete()
          .eq("id", lot.id)
          .eq("user_id", userId);
        if (deleteError) return { error: deleteError.message };
      } else {
        const { error: updateError } = await supabase
          .from("investments")
          .update({
            quantity: remainingLotQuantity,
            total_cost: remainingLotCost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lot.id)
          .eq("user_id", userId);
        if (updateError) return { error: updateError.message };
      }

      remainingQuantity = Number((remainingQuantity - movedQuantity).toFixed(8));
    }

    // Cash fee: deduct from the source account's cash as a `correction`
    // (a cost, not a budget expense), mirroring the investment-buy deduction.
    if (parsed.data.fee_cash > 0) {
      const sourceAccount = accounts.find(
        (account) => account.id === parsed.data.source_account_id,
      );
      const sourceCurrency = (sourceAccount?.currency as string) ?? "USD";

      const parsedDate = new Date(`${parsed.data.transfer_date}T00:00:00`);
      const monthResult = await createMonth(
        parsedDate.getFullYear(),
        parsedDate.getMonth() + 1,
      );
      if ("error" in monthResult) return { error: monthResult.error };
      const monthId = monthResult.data.id;

      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("base_currency")
        .eq("user_id", userId)
        .maybeSingle();
      const baseCurrency = prefs?.base_currency ?? "USD";

      const amount = -Math.abs(parsed.data.fee_cash);
      let exchangeRate = 1;
      let baseAmount = amount;
      if (sourceCurrency !== baseCurrency) {
        const fxResult = await getOrFetchFxRate({
          date: parsed.data.transfer_date,
          from: sourceCurrency,
          to: baseCurrency,
        });
        if ("error" in fxResult) return fxResult;
        exchangeRate = fxResult.data;
        baseAmount = Number((amount * fxResult.data).toFixed(4));
      }

      const { data: feeTx, error: feeTxError } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          month_id: monthId,
          category_id: null,
          transaction_type: "correction",
          date: parsed.data.transfer_date,
          description: `Comisión transferencia ${parsed.data.asset_name}`,
          notes: null,
        })
        .select()
        .single();
      if (feeTxError) return { error: feeTxError.message };

      const { error: feeAmountError } = await supabase
        .from("transaction_amounts")
        .insert({
          transaction_id: feeTx.id,
          account_id: parsed.data.source_account_id,
          amount,
          original_currency: sourceCurrency,
          exchange_rate: exchangeRate,
          base_amount: baseAmount,
        });
      if (feeAmountError) {
        await supabase.from("transactions").delete().eq("id", feeTx.id);
        return { error: feeAmountError.message };
      }

      await recalculateOpeningBalances(monthId);
    }

    return { data: null };
  } catch {
    return { error: "Error al transferir posicion" };
  }
}

/* ------------------------------------------------------------------ */
/* Ventas                                                               */
/* ------------------------------------------------------------------ */

const QTY_EPSILON = 0.00000001;

export async function sellInvestment(
  input: unknown,
): Promise<ActionResult<InvestmentSale>> {
  try {
    const parsed = SellInvestmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("id, account_type, currency")
      .eq("id", parsed.data.account_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (accError) return { error: accError.message };
    if (!account) return { error: "Cuenta no encontrada" };

    const { data: lots, error: lotsError } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", parsed.data.account_id)
      .eq("asset_name", parsed.data.asset_name)
      .eq("asset_type", parsed.data.asset_type)
      .eq("currency", parsed.data.currency)
      .order("purchase_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (lotsError) return { error: lotsError.message };

    const matchingLots = (lots ?? []).filter(
      (lot) =>
        (lot.ticker ?? null) === (parsed.data.ticker ?? null) &&
        (lot.isin ?? null) === (parsed.data.isin ?? null),
    );

    const totalQuantity = matchingLots.reduce(
      (sum, lot) => sum + Number(lot.quantity),
      0,
    );

    if (totalQuantity <= 0) {
      return { error: "No hay posición para vender" };
    }

    if (parsed.data.quantity_sold > totalQuantity + QTY_EPSILON) {
      return { error: "No hay cantidad suficiente para vender" };
    }

    const totalCostBasis = matchingLots.reduce(
      (sum, lot) => sum + Number(lot.total_cost),
      0,
    );
    const avgCost = totalCostBasis / totalQuantity;
    const costBasisOfSale = Number(
      (parsed.data.quantity_sold * avgCost).toFixed(4),
    );
    const grossProceeds = Number(
      (parsed.data.quantity_sold * parsed.data.price_per_unit).toFixed(4),
    );
    const fees = parsed.data.fees ?? 0;
    const tax = parsed.data.tax ?? 0;
    const realizedPnl = Number(
      (grossProceeds - fees - tax - costBasisOfSale).toFixed(4),
    );
    const netProceeds = Number((grossProceeds - fees - tax).toFixed(4));

    const { data: saleRow, error: saleError } = await supabase
      .from("investment_sales")
      .insert({
        user_id: userId,
        account_id: parsed.data.account_id,
        asset_name: parsed.data.asset_name,
        ticker: parsed.data.ticker ?? null,
        isin: parsed.data.isin ?? null,
        asset_type: parsed.data.asset_type,
        quantity_sold: parsed.data.quantity_sold,
        price_per_unit: parsed.data.price_per_unit,
        total_proceeds: grossProceeds,
        fees,
        tax,
        cost_basis: costBasisOfSale,
        realized_pnl: realizedPnl,
        currency: parsed.data.currency,
        sale_date: parsed.data.sale_date,
        notes: parsed.data.notes ?? null,
      })
      .select()
      .single();

    if (saleError) return { error: saleError.message };

    // Reducir lotes proporcionalmente para mantener el avg cost
    const remainingQuantity = totalQuantity - parsed.data.quantity_sold;
    const factor = remainingQuantity / totalQuantity;

    for (const lot of matchingLots) {
      const lotQty = Number(lot.quantity);
      const lotCost = Number(lot.total_cost);
      const newQty = Number((lotQty * factor).toFixed(8));
      const newCost = Number((lotCost * factor).toFixed(4));

      if (newQty <= QTY_EPSILON) {
        const { error: deleteError } = await supabase
          .from("investments")
          .delete()
          .eq("id", lot.id)
          .eq("user_id", userId);
        if (deleteError) {
          await supabase.from("investment_sales").delete().eq("id", saleRow.id);
          return { error: deleteError.message };
        }
      } else {
        const { error: updateError } = await supabase
          .from("investments")
          .update({
            quantity: newQty,
            total_cost: newCost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lot.id)
          .eq("user_id", userId);
        if (updateError) {
          await supabase.from("investment_sales").delete().eq("id", saleRow.id);
          return { error: updateError.message };
        }
      }
    }

    const eligibleForCredit =
      account.account_type === "investment_broker" ||
      ((account.account_type === "crypto_exchange" ||
        account.account_type === "crypto_wallet") &&
        account.currency === parsed.data.currency);

    if (eligibleForCredit && !parsed.data.skip_credit && netProceeds > 0) {
      const creditError = await autoCreditToAccount(
        supabase,
        userId,
        parsed.data.account_id,
        account.currency,
        netProceeds,
        parsed.data.sale_date,
        parsed.data.asset_name,
        saleRow.id,
      );
      if (creditError) {
        console.warn("Auto-credit failed:", creditError);
      }
    }

    return {
      data: {
        ...saleRow,
        quantity_sold: Number(saleRow.quantity_sold),
        price_per_unit: Number(saleRow.price_per_unit),
        total_proceeds: Number(saleRow.total_proceeds),
        fees: Number(saleRow.fees),
        tax: Number(saleRow.tax),
        cost_basis: Number(saleRow.cost_basis),
        realized_pnl: Number(saleRow.realized_pnl),
      } as InvestmentSale,
    };
  } catch {
    return { error: "Error al registrar venta" };
  }
}

async function autoCreditToAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  accountId: string,
  accountCurrency: string,
  netProceeds: number,
  date: string,
  assetName: string,
  saleId: string,
): Promise<string | null> {
  try {
    const parsedDate = new Date(`${date}T00:00:00`);
    const year = parsedDate.getFullYear();
    const month = parsedDate.getMonth() + 1;

    const { data: monthRow } = await supabase
      .from("months")
      .select("id")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (!monthRow) return null;

    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const baseCurrency = prefsRow?.base_currency ?? "USD";

    const amount = Math.abs(netProceeds);
    let exchangeRate = 1;
    let baseAmount = amount;
    if (accountCurrency !== baseCurrency) {
      const fxResult = await getOrFetchFxRate({
        date,
        from: accountCurrency,
        to: baseCurrency,
      });
      if ("error" in fxResult) return fxResult.error;
      exchangeRate = fxResult.data;
      baseAmount = Number((amount * fxResult.data).toFixed(4));
    }

    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        month_id: monthRow.id,
        category_id: null,
        transaction_type: "correction",
        date,
        description: `Venta: ${assetName}`,
        notes: null,
        source_investment_sale_id: saleId,
      })
      .select()
      .single();

    if (txError) return txError.message;
    if (!tx) return "No se pudo crear la transacción de crédito";

    const { error: amountError } = await supabase
      .from("transaction_amounts")
      .insert({
        transaction_id: tx.id,
        account_id: accountId,
        amount,
        original_currency: accountCurrency,
        exchange_rate: exchangeRate,
        base_amount: baseAmount,
      });

    if (amountError) {
      await supabase.from("transactions").delete().eq("id", tx.id);
      return amountError.message;
    }

    await recalculateOpeningBalances(monthRow.id);

    return null;
  } catch (e) {
    console.error("autoCreditToAccount:", e);
    return e instanceof Error ? e.message : "Error desconocido en auto-crédito";
  }
}

export async function getInvestmentSales(): Promise<
  ActionResult<InvestmentSaleWithAccount[]>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("investment_sales")
      .select(
        `
        *,
        accounts ( name ),
        currencies ( symbol )
      `,
      )
      .eq("user_id", userId)
      .order("sale_date", { ascending: false });

    if (error) return { error: error.message };

    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const baseCurrency = prefsRow?.base_currency ?? "USD";

    // Resolve FX per unique (currency, sale_date) pair. Sales are usually few
    // and FX rates are cached in fx_rates, so this is cheap.
    const fxKey = (currency: string, date: string) => `${currency}|${date}`;
    const fxCache = new Map<string, number>();
    for (const row of data ?? []) {
      const key = fxKey(row.currency as string, row.sale_date as string);
      if (fxCache.has(key)) continue;
      if (row.currency === baseCurrency) {
        fxCache.set(key, 1);
        continue;
      }
      const fx = await getOrFetchFxRate({
        date: row.sale_date as string,
        from: row.currency as string,
        to: baseCurrency,
      });
      fxCache.set(key, "error" in fx ? 1 : fx.data);
    }

    const mapped = (data ?? []).map((row) => {
      const accountRaw = row.accounts;
      const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const currencyRaw = row.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;

      const rate = fxCache.get(fxKey(row.currency as string, row.sale_date as string)) ?? 1;
      const toBase = (n: number) => Number((n * rate).toFixed(4));

      return {
        id: row.id,
        user_id: row.user_id,
        account_id: row.account_id,
        asset_name: row.asset_name,
        ticker: row.ticker,
        isin: row.isin,
        asset_type: row.asset_type as AssetType,
        quantity_sold: Number(row.quantity_sold),
        price_per_unit: Number(row.price_per_unit),
        total_proceeds: Number(row.total_proceeds),
        fees: Number(row.fees),
        tax: Number(row.tax),
        cost_basis: Number(row.cost_basis),
        realized_pnl: Number(row.realized_pnl),
        total_proceeds_base: toBase(Number(row.total_proceeds)),
        fees_base: toBase(Number(row.fees)),
        tax_base: toBase(Number(row.tax)),
        cost_basis_base: toBase(Number(row.cost_basis)),
        realized_pnl_base: toBase(Number(row.realized_pnl)),
        base_currency: baseCurrency,
        currency: row.currency,
        sale_date: row.sale_date,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
        account_name: (account as { name?: string })?.name ?? "",
        currency_symbol:
          (currency as { symbol?: string })?.symbol ?? row.currency,
      } as InvestmentSaleWithAccount;
    });

    return { data: mapped };
  } catch {
    return { error: "Error al obtener ventas" };
  }
}

/**
 * Deletes an investment_sale, reverses its auto-credit correction, and
 * restores the lots that were proportionally reduced when the sale was
 * recorded. This is a best-effort restoration: we re-insert a single lot
 * with the cost_basis stored on the sale, dated at the original purchase
 * date. If the sale was a partial exit, this collapses the remaining
 * partial lots into a single lot — accounting-wise correct but loses lot
 * detail.
 */
export async function deleteInvestmentSale(
  saleId: string,
): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: sale, error: saleError } = await supabase
      .from("investment_sales")
      .select("*")
      .eq("id", saleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (saleError) return { error: saleError.message };
    if (!sale) return { error: "Venta no encontrada" };

    // Delete any auto-credit correction linked to this sale.
    const { data: linkedTxs } = await supabase
      .from("transactions")
      .select("id, month_id")
      .eq("user_id", userId)
      .eq("source_investment_sale_id", saleId);

    const monthsToRecalc = new Set<string>();
    for (const tx of linkedTxs ?? []) {
      monthsToRecalc.add(tx.month_id as string);
      await supabase.from("transactions").delete().eq("id", tx.id).eq("user_id", userId);
    }

    // Restore a lot with the same cost_basis so cost-basis accounting stays
    // honest. Pricing per unit is recomputed.
    const restoreQty = Number(sale.quantity_sold);
    const restoreCost = Number(sale.cost_basis);
    if (restoreQty > QTY_EPSILON && restoreCost > 0) {
      const pricePerUnit = restoreCost / restoreQty;
      const { error: insertError } = await supabase.from("investments").insert({
        user_id: userId,
        account_id: sale.account_id,
        asset_name: sale.asset_name,
        ticker: sale.ticker,
        isin: sale.isin,
        asset_type: sale.asset_type,
        quantity: restoreQty,
        price_per_unit: pricePerUnit,
        total_cost: restoreCost,
        currency: sale.currency,
        purchase_date: sale.sale_date, // best we can do without original lot data
        notes: `Restaurado al revertir venta del ${sale.sale_date}`,
      });
      if (insertError) return { error: insertError.message };
    }

    const { error: deleteError } = await supabase
      .from("investment_sales")
      .delete()
      .eq("id", saleId)
      .eq("user_id", userId);
    if (deleteError) return { error: deleteError.message };

    const earliest = await pickEarliestMonth(supabase, [...monthsToRecalc]);
    if (earliest) {
      await recalculateOpeningBalances(earliest);
    }

    return { data: null };
  } catch {
    return { error: "Error al eliminar la venta" };
  }
}

/* ------------------------------------------------------------------ */
/* Precios actuales                                                     */
/* ------------------------------------------------------------------ */

export async function fetchCurrentPrices(
  tickers: { key: string; ticker?: string | null; isin?: string | null; assetType: string }[],
  baseCurrency: string
): Promise<ActionResult<Record<string, number>>> {
  try {
    const prices: Record<string, number> = {};

    const cryptoTickers = tickers
      .filter((t) => t.assetType === "crypto")
      .map((t) => ({ key: t.key, code: (t.ticker ?? t.key).trim().toUpperCase() }));
    const marketTickers = tickers.filter((t) => t.assetType !== "crypto");

    if (cryptoTickers.length > 0) {
      const cryptoPrices = await fetchCryptoPrices(
        cryptoTickers.map((ticker) => ticker.code),
        baseCurrency
      );
      for (const ticker of cryptoTickers) {
        const price = cryptoPrices[ticker.code];
        if (price != null) prices[ticker.key] = price;
      }
    }

    if (marketTickers.length > 0) {
      const twelveDataPrices = await fetchTwelveDataPrices(
        marketTickers.map((ticker) => ({
          key: ticker.key,
          symbol: ticker.ticker,
          isin: ticker.isin,
        })),
      );

      for (const ticker of marketTickers) {
        const resolved = twelveDataPrices[ticker.key];
        if (resolved) {
          prices[ticker.key] = resolved.price;
        }
      }

      const unresolved = marketTickers.filter((ticker) => prices[ticker.key] == null && ticker.ticker);
      if (unresolved.length > 0) {
        try {
          const yahooFinance = await import("yahoo-finance2");
          const yf = yahooFinance.default;

          for (const ticker of unresolved) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const quote: any = await yf.quote(ticker.ticker!);
              if (quote && typeof quote.regularMarketPrice === "number") {
                prices[ticker.key] = quote.regularMarketPrice;
              }
            } catch {
              // continue
            }
          }
        } catch {
          // ignore fallback errors
        }
      }
    }

    return { data: prices };
  } catch {
    return { error: "Error al obtener precios actuales" };
  }
}
