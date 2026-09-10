import { NextResponse } from "next/server";
import { withCors } from "../../../../lib/fomo";
import { readQualityLedger } from "../../../../lib/quality-slo-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 45);
  const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(rawLimit, 366)) : 45;
  try {
    const entries = await readQualityLedger(limit);
    return withCors(NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    return withCors(NextResponse.json({
      entries: [],
      error: error instanceof Error ? error.message : String(error),
    }, { status: 503, headers: { "Cache-Control": "no-store" } }));
  }
}
