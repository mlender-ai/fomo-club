import { NextResponse } from "next/server";
import { writeUsMarketQuoteRows } from "@/lib/us-market-cache";
import { fetchUsMarketRowsFromSource, latestUsSessionAsOf } from "@/lib/us-market-source";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SLOT_COUNT = 2;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parseSlot(value: string | undefined): number | null {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return null;
  return slot;
}

export async function GET(request: Request, context: { params: Promise<{ slot?: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const slot = parseSlot(params.slot);
  if (slot === null) {
    return NextResponse.json({ ok: false, error: "invalid_slot", slot: params.slot, slotCount: SLOT_COUNT }, { status: 400 });
  }

  const rows = await fetchUsMarketRowsFromSource({ slot, slotCount: SLOT_COUNT, hydrateSparklineFallback: true });
  const written = await writeUsMarketQuoteRows(rows, {
    slot,
    sessionDate: latestUsSessionAsOf().date,
  });

  return NextResponse.json({
    ok: true,
    slot,
    slotCount: SLOT_COUNT,
    fetched: rows.length,
    written: written.rows,
    rowsWithPrice: written.rowsWithPrice,
    rowsWithSparkline: written.rowsWithSparkline,
  });
}
