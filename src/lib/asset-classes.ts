/**
 * How a holding is priced depends on its class. Cash (a fiat balance held in
 * an exchange or broker) is worth its amount at the exchange rate, and a
 * stablecoin one unit of the currency it tracks: neither has a market price
 * or a gain worth showing.
 */

/** Stablecoins and the fiat currency each one tracks. */
const STABLECOIN_REFERENCE: Record<string, string> = {
  USDT: "USD",
  USDC: "USD",
  DAI: "USD",
  BUSD: "USD",
  TUSD: "USD",
  FDUSD: "USD",
  PYUSD: "USD",
  USDP: "USD",
  USDE: "USD",
  EURC: "EUR",
  EURT: "EUR",
};

/** Fiat currency codes, some of which are also listed tickers (USD, NOK). */
const FIAT_CODES = new Set([
  "USD", "EUR", "GBP", "CHF", "JPY", "CNY", "ARS", "BRL", "CLP", "COP", "MXN",
  "PEN", "UYU", "CAD", "AUD", "NZD", "DKK", "SEK", "NOK", "PLN", "CZK", "HUF",
  "RON", "BGN", "TRY", "ZAR", "INR", "HKD", "SGD", "KRW", "ILS",
]);

type Holding = { asset_type: string; ticker?: string | null; asset_name: string };

const codeOf = (holding: Pick<Holding, "ticker" | "asset_name">) =>
  (holding.ticker?.trim() || holding.asset_name.trim()).toUpperCase();

export function isCashLike(assetType: string): boolean {
  return assetType === "cash" || assetType === "stablecoin";
}

/**
 * The fiat currency one unit of a cash or stablecoin holding is worth; null
 * for any other class.
 */
export function cashCurrencyOf(holding: Holding): string | null {
  if (holding.asset_type === "cash") return codeOf(holding);
  if (holding.asset_type === "stablecoin") return STABLECOIN_REFERENCE[codeOf(holding)] ?? "USD";
  return null;
}

/**
 * A lookup that names money rather than a listed instrument: a stablecoin
 * code, or a currency code filed as "Otro" or held in that same currency. A
 * market-data provider would answer with an unrelated security (USD is also
 * an ETF's ticker); a stock like NOK held in dollars is not money.
 */
export function namesMoney(request: Pick<PriceRequest, "ticker" | "currency" | "assetType">): boolean {
  const code = request.ticker?.trim().toUpperCase();
  if (!code) return false;
  if (code in STABLECOIN_REFERENCE) return true;
  return FIAT_CODES.has(code) && (code === request.currency?.toUpperCase() || request.assetType === "other");
}

type PricedLot = {
  asset_type: string;
  ticker: string | null;
  isin: string | null;
  asset_name: string;
  currency: string;
};

/** A price lookup for holdings (see resolvePricesWithSources). */
export type PriceRequest = {
  key: string;
  ticker?: string | null;
  isin?: string | null;
  /** Finds a manual price for a holding with neither ticker nor ISIN. */
  name?: string;
  assetType: string;
  /** The currency of the holding's cost; its price comes back in it. */
  currency?: string;
};

/**
 * The price lookup for a lot. Every view of the portfolio asks the same
 * question for the same lot, so a price found or set once applies to all of
 * them. The key names the lookup and the currency the price comes back in:
 * USDT filed as crypto and as a stablecoin, or held against two currencies,
 * is priced separately.
 */
export function priceRequestFor(lot: PricedLot): PriceRequest {
  const ticker = lot.ticker?.trim() || null;
  const isin = lot.isin?.trim() || null;
  const name = lot.asset_name.trim();
  // Crypto, cash and stablecoins are looked up by their code, which a lot
  // without ticker carries in its name.
  const code =
    lot.asset_type === "crypto"
      ? (ticker ?? isin ?? name)
      : isCashLike(lot.asset_type)
        ? (ticker ?? name)
        : null;
  const lookup = code ?? (ticker || isin ? `${ticker ?? ""}|${isin ?? ""}` : name);
  return {
    key: `${lot.asset_type}:${lot.currency}:${lookup}`,
    ticker: code ?? ticker,
    isin,
    name,
    assetType: lot.asset_type,
    currency: lot.currency,
  };
}

/**
 * A lot's market value and cost in the base currency, given the prices and
 * rates resolvePricesWithSources returned. A lot without a price counts at
 * cost; null when its currency has no rate.
 */
export function lotValueInBase(
  lot: PricedLot & { quantity: number; total_cost: number },
  prices: Record<string, number>,
  ratesToBase: Record<string, number>,
): { current: number; cost: number } | null {
  const rate = ratesToBase[lot.currency];
  if (rate == null) return null;
  const price = prices[priceRequestFor(lot).key];
  return {
    current: (price != null ? lot.quantity * price : lot.total_cost) * rate,
    cost: lot.total_cost * rate,
  };
}
