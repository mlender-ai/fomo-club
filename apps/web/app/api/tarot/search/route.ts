import { NextRequest, NextResponse } from "next/server";
import { searchResearchTickers } from "@trading/shared/src/researchLive";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const market = req.nextUrl.searchParams.get("market");

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const marketFilter = market === "US" || market === "KR" ? market : undefined;
  const results = await searchResearchTickers(q, marketFilter);

  return NextResponse.json({
    results: results.map((r) => ({
      ticker: r.ticker,
      label: r.label,
      market: r.market,
      exchange: r.exchange,
    })),
  });
}
