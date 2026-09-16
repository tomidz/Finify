import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import { loadInvestmentValuation } from "@/lib/server/investment-valuation";

/**
 * Investment valuation lives in a GET route handler rather than a server
 * action: the client dispatches server actions one at a time, and this read
 * waits on external price providers, so as an action it held up every other
 * read on the page behind it.
 */
export async function GET(request: Request) {
  const ctx = await getServerContext();
  if (!ctx) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const yearParam = new URL(request.url).searchParams.get("year");
  let year: number | null = null;
  if (yearParam !== null) {
    year = Number(yearParam);
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      return Response.json({ error: "Año inválido" }, { status: 400 });
    }
  }

  const baseCurrency = await loadBaseCurrency(ctx);
  if ("error" in baseCurrency) {
    return Response.json({ error: baseCurrency.error }, { status: 500 });
  }

  const valuation = await loadInvestmentValuation(ctx, baseCurrency.data, year);
  if ("error" in valuation) {
    console.error("GET /api/investments/valuation:", valuation.error);
    return Response.json(
      { error: "Error al obtener valor actual de inversiones" },
      { status: 500 },
    );
  }

  return Response.json(valuation.data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
