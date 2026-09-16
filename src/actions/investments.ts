"use server";

import { createClient } from "@/lib/supabase/server";
import type { Json, TablesUpdate } from "@/types/database.types";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { resolveFxRates } from "@/lib/server/fx-range";
import { ledgerRpcError } from "@/lib/server/ledger-rpc";
import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import {
  loadInvestmentValuation,
  type ValuationByAccount,
  type ValuationByMonth,
} from "@/lib/server/investment-valuation";
import { resolveCurrentPrices } from "@/lib/server/prices";
import {
  AdjustInvestmentPositionSchema,
  CreateInvestmentSchema,
  SellInvestmentSchema,
  TransferInvestmentPositionSchema,
  UpdateInvestmentSchema,
} from "@/lib/validations/investment.schema";
import type {
  InvestmentSaleWithAccount,
  InvestmentWithAccount,
  AssetType,
} from "@/types/investments";
import { fetchTwelveDataInstrument } from "@/lib/twelvedata";

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
): Promise<ActionResult<{ id: string }>> {
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

    // Fees/taxes are capitalized: they raise the lot's cost basis and are
    // part of the cash deducted (mirrors the sale flow, where they reduce
    // net proceeds).
    const purchaseCosts =
      (parsed.data.fees ?? 0) + (parsed.data.tax ?? 0);
    const totalCostWithFees = Number(
      (parsed.data.total_cost + purchaseCosts).toFixed(4),
    );

    // Auto-descuento solo cuando la moneda de la inversión coincide con la de
    // la cuenta: un débito cross-currency registraría el monto en la moneda
    // equivocada (p. ej. cuenta EUR debitada "1.000 EUR" por una compra de
    // USD 1.000). En ese caso el usuario registra el débito manualmente.
    let cashRate: number | null = null;
    if (
      CASH_ACCOUNT_TYPES.has(account.account_type) &&
      account.currency === parsed.data.currency &&
      !parsed.data.skip_deduction
    ) {
      cashRate = await cashRateToBase(
        supabase,
        userId,
        account.currency,
        parsed.data.purchase_date,
      );
      if (cashRate == null) return { error: CASH_RATE_FAILED };
    }

    const { data, error } = await supabase.rpc("create_investment", {
      p_lot: {
        account_id: parsed.data.account_id,
        asset_name: parsed.data.asset_name,
        ticker: parsed.data.ticker ?? null,
        isin: parsed.data.isin ?? null,
        asset_type: parsed.data.asset_type,
        quantity: parsed.data.quantity,
        price_per_unit: parsed.data.price_per_unit,
        total_cost: totalCostWithFees,
        currency: parsed.data.currency,
        purchase_date: parsed.data.purchase_date,
        notes: parsed.data.notes ?? null,
      },
      p_cash_rate: cashRate ?? undefined,
    });
    if (error) {
      return ledgerRpcError("create_investment", error, "Error al crear inversión");
    }

    return { data: { id: data } };
  } catch (e) {
    console.error("createInvestment:", e);
    return { error: "Error al crear inversión" };
  }
}

const CASH_ACCOUNT_TYPES = new Set([
  "investment_broker",
  "crypto_exchange",
  "crypto_wallet",
]);

const CASH_RATE_FAILED =
  "No se pudo obtener el tipo de cambio para la caja de la cuenta. No se guardó nada.";

/**
 * Rate from an account's currency to the base currency on `date`, for the
 * cash an investment moves; null when it cannot be looked up.
 */
async function cashRateToBase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  currency: string,
  date: string,
): Promise<number | null> {
  const { data: prefsRow } = await supabase
    .from("user_preferences")
    .select("base_currency")
    .eq("user_id", userId)
    .maybeSingle();
  const baseCurrency = prefsRow?.base_currency ?? "USD";
  if (currency === baseCurrency) return 1;
  const fx = await getOrFetchFxRate({ date, from: currency, to: baseCurrency });
  return "error" in fx ? null : fx.data;
}

export async function updateInvestment(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
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
    // fees/tax only exist at purchase time (already baked into total_cost).
    const { id, skip_deduction: _, fees: _fees, tax: _tax, ...updates } = parsed.data;
    const clean = Object.fromEntries(
      Object.entries(updates).filter(
        ([_, v]) => v !== undefined && v !== null
      )
    ) as TablesUpdate<"investments">;

    const [{ data: existingLot }, { count: cashCount, error: cashError }] =
      await Promise.all([
        supabase
          .from("investments")
          .select("account_id, purchase_date, total_cost, currency, asset_name")
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("source_investment_id", id),
      ]);
    if (!existingLot) return { error: "Inversión no encontrada" };
    if (cashError) return { error: cashError.message };

    // A purchase that moved cash moves it again when what the cash depends on
    // changes, at the rate of the account and date the lot ends up with.
    const cashChanged =
      (clean.account_id !== undefined && clean.account_id !== existingLot.account_id) ||
      (clean.purchase_date !== undefined && clean.purchase_date !== existingLot.purchase_date) ||
      (clean.total_cost !== undefined && clean.total_cost !== Number(existingLot.total_cost)) ||
      (clean.currency !== undefined && clean.currency !== existingLot.currency) ||
      (clean.asset_name !== undefined && clean.asset_name !== existingLot.asset_name);
    let cashRate: number | null = null;
    if ((cashCount ?? 0) > 0 && cashChanged) {
      const { data: account } = await supabase
        .from("accounts")
        .select("currency")
        .eq("id", clean.account_id ?? existingLot.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!account) return { error: "Cuenta no encontrada" };
      cashRate = await cashRateToBase(
        supabase,
        userId,
        account.currency,
        clean.purchase_date ?? existingLot.purchase_date,
      );
      if (cashRate == null) return { error: CASH_RATE_FAILED };
    }

    const { error } = await supabase.rpc("update_investment", {
      p_id: id,
      p_changes: clean as Json,
      p_cash_rate: cashRate ?? undefined,
    });
    if (error) {
      return ledgerRpcError("update_investment", error, "Error al actualizar inversión");
    }

    return { data: { id } };
  } catch (e) {
    console.error("updateInvestment:", e);
    return { error: "Error al actualizar inversión" };
  }
}

export async function deleteInvestment(
  id: string
): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    // The linked cash goes with the lot.
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_investment", { p_id: id });
    if (error) {
      return ledgerRpcError("delete_investment", error, "Error al eliminar inversión");
    }

    return { data: null };
  } catch (e) {
    console.error("deleteInvestment:", e);
    return { error: "Error al eliminar inversión" };
  }
}

export async function getCurrentInvestmentValuesByAccount(): Promise<
  ActionResult<ValuationByAccount>
> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    const baseCurrency = await loadBaseCurrency(ctx);
    if ("error" in baseCurrency) return baseCurrency;
    const valuation = await loadInvestmentValuation(ctx, baseCurrency.data, null);
    if ("error" in valuation) return valuation;
    return { data: valuation.data.byAccount };
  } catch {
    return { error: "Error al obtener valor actual de inversiones" };
  }
}

export async function getCurrentInvestmentValuesByMonth(
  year: number,
): Promise<ActionResult<ValuationByMonth>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    const baseCurrency = await loadBaseCurrency(ctx);
    if ("error" in baseCurrency) return baseCurrency;
    const valuation = await loadInvestmentValuation(ctx, baseCurrency.data, year);
    if ("error" in valuation) return valuation;
    return { data: valuation.data.byMonth ?? {} };
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
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

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

    // Cash fee: deduct from the source account's cash as an investment
    // movement (a cost, not a budget expense), mirroring the purchase.
    let feeRate: number | null = null;
    if (parsed.data.fee_cash > 0) {
      const sourceAccount = accounts.find(
        (account) => account.id === parsed.data.source_account_id,
      );
      feeRate = await cashRateToBase(
        supabase,
        userId,
        (sourceAccount?.currency as string) ?? "USD",
        parsed.data.transfer_date,
      );
      if (feeRate == null) return { error: CASH_RATE_FAILED };
    }

    // Atomic FIFO move: the RPC locks the source holding, validates
    // availability inside the lock and rolls back as a unit, together with
    // the fee. The TS loop it replaces could duplicate the position between
    // accounts (insert at destination succeeded, source reduction failed).
    const { error: moveError } = await supabase.rpc("transfer_investment_position", {
      p_move: {
        source_account_id: parsed.data.source_account_id,
        destination_account_id: parsed.data.destination_account_id,
        asset_name: parsed.data.asset_name,
        ticker: parsed.data.ticker ?? "",
        asset_type: parsed.data.asset_type,
        currency: parsed.data.currency,
        quantity: parsed.data.quantity,
        fee_quantity: parsed.data.fee_quantity,
        transfer_date: parsed.data.transfer_date,
        notes: parsed.data.notes ?? "Transferido desde otra cuenta",
      },
      p_fee_cash: parsed.data.fee_cash,
      p_fee_rate: feeRate ?? undefined,
    });
    if (moveError) {
      return ledgerRpcError("transfer_investment_position", moveError, "Error al transferir posicion");
    }

    return { data: null };
  } catch (e) {
    console.error("transferInvestmentPosition:", e);
    return { error: "Error al transferir posicion" };
  }
}

/**
 * Adjusts a holding's quantity without touching cash — the investment
 * counterpart of an account correction. Increases insert a new lot (cost
 * basis defaults to 0: interés en especie, airdrop, reconciliación);
 * decreases reduce the matching lots proportionally (quantity and cost),
 * with no sale record, realized PnL, or cash credit.
 */
export async function adjustInvestmentPosition(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const parsed = AdjustInvestmentPositionSchema.safeParse(input);
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
      .select("id")
      .eq("id", parsed.data.account_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (accError) return { error: accError.message };
    if (!account) return { error: "Cuenta no encontrada" };

    if (parsed.data.direction === "increase") {
      const costBasis = parsed.data.cost_basis ?? 0;
      const { error: insertError } = await supabase.from("investments").insert({
        user_id: userId,
        account_id: parsed.data.account_id,
        asset_name: parsed.data.asset_name,
        ticker: parsed.data.ticker ?? null,
        isin: parsed.data.isin ?? null,
        asset_type: parsed.data.asset_type,
        quantity: parsed.data.quantity,
        price_per_unit: costBasis / parsed.data.quantity,
        total_cost: costBasis,
        currency: parsed.data.currency,
        purchase_date: parsed.data.adjustment_date,
        notes: parsed.data.notes ?? "Ajuste de posición",
      });
      if (insertError) return { error: insertError.message };
      return { data: null };
    }

    // Decrease: atomic proportional reduction (same RPC as sales — locks the
    // holding and validates availability inside the lock).
    const { error: reduceError } = await supabase.rpc(
      "reduce_investment_lots",
      {
        p_account_id: parsed.data.account_id,
        p_asset_name: parsed.data.asset_name,
        p_ticker: parsed.data.ticker ?? "",
        p_asset_type: parsed.data.asset_type,
        p_currency: parsed.data.currency,
        p_quantity: parsed.data.quantity,
      },
    );
    if (reduceError) {
      return {
        error: reduceError.message.includes("No hay cantidad")
          ? "No hay cantidad suficiente para ajustar"
          : reduceError.message,
      };
    }

    return { data: null };
  } catch {
    return { error: "Error al ajustar la posición" };
  }
}

/* ------------------------------------------------------------------ */
/* Ventas                                                               */
/* ------------------------------------------------------------------ */

const QTY_EPSILON = 0.00000001;

// The UI groups lots into a holding by `ticker || asset_name` (see
// InvestmentsTable). Server-side lot matching must use the same key, or
// lots with inconsistent metadata (e.g. ticker null on one lot, set on
// another) silently drop out of the position and sells/adjustments fail
// with "no hay cantidad suficiente".
function lotMatchesHolding(
  lot: { ticker: string | null; asset_name: string },
  ticker: string | null | undefined,
  assetName: string,
): boolean {
  const lotKey = lot.ticker?.trim() || lot.asset_name.trim();
  const inputKey = ticker?.trim() || assetName.trim();
  return lotKey === inputKey;
}

export async function sellInvestment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
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
      .eq("asset_type", parsed.data.asset_type)
      .eq("currency", parsed.data.currency)
      .order("purchase_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (lotsError) return { error: lotsError.message };

    const matchingLots = (lots ?? []).filter((lot) =>
      lotMatchesHolding(lot, parsed.data.ticker, parsed.data.asset_name),
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

    const grossProceeds = Number(
      (parsed.data.quantity_sold * parsed.data.price_per_unit).toFixed(4),
    );
    const fees = parsed.data.fees ?? 0;
    const tax = parsed.data.tax ?? 0;
    const netProceeds = Number((grossProceeds - fees - tax).toFixed(4));

    // Same currency gate as the purchase deduction: a cross-currency credit
    // would book the proceeds in the wrong currency.
    let cashRate: number | null = null;
    if (
      CASH_ACCOUNT_TYPES.has(account.account_type) &&
      account.currency === parsed.data.currency &&
      !parsed.data.skip_credit &&
      netProceeds > 0
    ) {
      cashRate = await cashRateToBase(
        supabase,
        userId,
        account.currency,
        parsed.data.sale_date,
      );
      if (cashRate == null) return { error: CASH_RATE_FAILED };
    }

    // The sale, the lot reduction and the credit in one transaction. The
    // reduction locks the holding and re-validates availability inside the
    // lock (kills the concurrent double-sell race); the cost it removes there
    // becomes the sale's cost basis.
    const { data, error } = await supabase.rpc("record_investment_sale", {
      p_sale: {
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
        currency: parsed.data.currency,
        sale_date: parsed.data.sale_date,
        notes: parsed.data.notes ?? null,
      },
      p_cash_rate: cashRate ?? undefined,
    });
    if (error) {
      return ledgerRpcError("record_investment_sale", error, "Error al registrar venta");
    }

    return { data: { id: data } };
  } catch (e) {
    console.error("sellInvestment:", e);
    return { error: "Error al registrar venta" };
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

    const fxAt = await resolveFxRates(
      supabase,
      (data ?? []).map((row) => ({
        date: row.sale_date as string,
        from: row.currency as string,
      })),
      baseCurrency,
    );

    const mapped = (data ?? []).map((row) => {
      const accountRaw = row.accounts;
      const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const currencyRaw = row.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;

      const rate = fxAt(row.sale_date as string, row.currency as string) ?? 1;
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

    const { error } = await supabase.rpc("delete_investment_sale", {
      p_sale_id: saleId,
    });
    if (error) {
      return ledgerRpcError("delete_investment_sale", error, "Error al eliminar la venta");
    }

    return { data: null };
  } catch (e) {
    console.error("deleteInvestmentSale:", e);
    return { error: "Error al eliminar la venta" };
  }
}

/* ------------------------------------------------------------------ */
/* Precios actuales                                                     */
/* ------------------------------------------------------------------ */

export async function fetchCurrentPrices(
  tickers: { key: string; ticker?: string | null; isin?: string | null; assetType: string }[],
  baseCurrency: string,
  fresh = false,
): Promise<ActionResult<Record<string, number>>> {
  const ctx = await getServerContext();
  if (!ctx) return { error: "No autenticado" };
  return resolveCurrentPrices(tickers, baseCurrency, ctx, { fresh: fresh === true });
}
