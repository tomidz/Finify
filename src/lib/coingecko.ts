import { fetchJson, providerFailure, type ProviderFailure, type ProviderResult } from "@/lib/providers/fetch-json";

const CODE_TO_COINGECKO_ID: Record<string, string> = {
  AAVE: "aave",
  ADA: "cardano",
  ARB: "arbitrum",
  ATOM: "cosmos",
  APT: "aptos",
  AVAX: "avalanche-2",
  BCH: "bitcoin-cash",
  BNB: "binancecoin",
  BTC: "bitcoin",
  DOGE: "dogecoin",
  DOT: "polkadot",
  ETC: "ethereum-classic",
  ETH: "ethereum",
  FIL: "filecoin",
  FTM: "fantom",
  INJ: "injective-protocol",
  LDO: "lido-dao",
  LINK: "chainlink",
  LTC: "litecoin",
  MATIC: "matic-network",
  MKR: "maker",
  NEXO: "nexo",
  NEAR: "near",
  OP: "optimism",
  PEPE: "pepe",
  POL: "polygon-ecosystem-token",
  RENDER: "render-token",
  SHIB: "shiba-inu",
  SOL: "solana",
  SUI: "sui",
  TON: "the-open-network",
  TRX: "tron",
  UNI: "uniswap",
  USDC: "usd-coin",
  USDT: "tether",
  WBTC: "wrapped-bitcoin",
  XLM: "stellar",
  XRP: "ripple",
};

// Only answers are remembered: a failed search says nothing about the code.
const resolvedTickerCache = new Map<string, string | null>();

export type CryptoPriceMap = Record<string, number>;

function getCoinGeckoBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_COINGECKO_BASE_URL ??
    "https://api.coingecko.com/api/v3"
  );
}

function getCoinGeckoHeaders() {
  const apiKey = process.env.NEXT_PUBLIC_COINGECKO_API_KEY;
  return apiKey ? { "x-cg-demo-api-key": apiKey } : undefined;
}

async function resolveCoinGeckoId(code: string): Promise<ProviderResult<string>> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return { ok: false, reason: "not_found" };

  const staticMatch = CODE_TO_COINGECKO_ID[normalizedCode];
  if (staticMatch) return { ok: true, data: staticMatch };

  if (resolvedTickerCache.has(normalizedCode)) {
    const cached = resolvedTickerCache.get(normalizedCode);
    return cached ? { ok: true, data: cached } : { ok: false, reason: "not_found" };
  }

  const searchUrl = new URL(`${getCoinGeckoBaseUrl()}/search`);
  searchUrl.searchParams.set("query", normalizedCode);

  const result = await fetchJson<{
    coins?: Array<{ id: string; symbol: string; market_cap_rank?: number | null }>;
  } | null>("coingecko.search", searchUrl.toString(), { headers: getCoinGeckoHeaders() });
  if (!result.ok) return result;

  const match =
    result.data?.coins
      ?.filter((coin) => coin.symbol.toUpperCase() === normalizedCode)
      .sort(
        (a, b) =>
          (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) -
          (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER),
      )[0]?.id ?? null;

  resolvedTickerCache.set(normalizedCode, match);
  return match ? { ok: true, data: match } : providerFailure("coingecko.search", "not_found");
}

/** Prices by code in `vsCurrency` (see fetchCryptoPricesWithReasons). */
export async function fetchCryptoPrices(
  currencyCodes: string[],
  vsCurrency: string,
): Promise<CryptoPriceMap> {
  return (await fetchCryptoPricesWithReasons(currencyCodes, vsCurrency)).prices;
}

/** Prices by code in `vsCurrency`, and why each code left out has none. */
export async function fetchCryptoPricesWithReasons(
  currencyCodes: string[],
  vsCurrency: string,
): Promise<{ prices: CryptoPriceMap; failed: Record<string, ProviderFailure> }> {
  const uniqueCodes = Array.from(
    new Set(currencyCodes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
  );
  const failed: Record<string, ProviderFailure> = {};

  if (!vsCurrency || uniqueCodes.length === 0) return { prices: {}, failed };

  const vs = vsCurrency.trim().toLowerCase();

  const resolvedEntries = await Promise.all(
    uniqueCodes.map(async (code) => ({
      code,
      id: await resolveCoinGeckoId(code),
    })),
  );

  const found: { code: string; id: string }[] = [];
  for (const entry of resolvedEntries) {
    if (entry.id.ok) found.push({ code: entry.code, id: entry.id.data });
    else failed[entry.code] = entry.id.reason;
  }

  const ids = Array.from(new Set(found.map((entry) => entry.id)));

  if (ids.length === 0) return { prices: {}, failed };

  const url = new URL(`${getCoinGeckoBaseUrl()}/simple/price`);
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", vs);

  const quoted = await fetchJson<Record<string, Record<string, number | undefined> | null> | null>(
    "coingecko.price",
    url.toString(),
    { headers: getCoinGeckoHeaders() },
  );

  if (!quoted.ok) {
    for (const entry of found) failed[entry.code] = quoted.reason;
    return { prices: {}, failed };
  }

  const result: CryptoPriceMap = {};
  for (const entry of found) {
    const price = quoted.data?.[entry.id]?.[vs];
    if (typeof price === "number") {
      result[entry.code] = price;
    } else {
      providerFailure("coingecko.price", "not_found");
      failed[entry.code] = "not_found";
    }
  }

  if (vs === "usd") {
    for (const stablecoin of ["USDT", "USDC"]) {
      if (result[stablecoin] == null && uniqueCodes.includes(stablecoin)) {
        result[stablecoin] = 1;
        delete failed[stablecoin];
      }
    }
  }

  return { prices: result, failed };
}
