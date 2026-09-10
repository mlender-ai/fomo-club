import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../../lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** TasteSignal actor mutation is retired. JudgmentLedger keeps anonymous and uid actors immutable and queries both. */
export async function POST() {
  return corsJson({ ok: true, linked: 0, retired: true }, { headers: { "Cache-Control": "no-store" } });
}
