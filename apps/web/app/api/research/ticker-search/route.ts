import { NextRequest, NextResponse } from "next/server";

import { searchResearchTickers } from "@fomo/shared/src/researchLive";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const market = request.nextUrl.searchParams.get("market");

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchResearchTickers(query, market === "US" || market === "KR" ? market : undefined);
  return NextResponse.json({ results });
}
