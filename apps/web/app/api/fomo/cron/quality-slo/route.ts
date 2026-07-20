import { NextResponse } from "next/server";
import { withCors } from "../../../../../lib/fomo";
import { materializeRecentQualitySnapshots } from "../../../../../lib/quality-slo-ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  try {
    const result = await materializeRecentQualitySnapshots(2);
    const latest = result.entries[0];
    if (!latest) throw new Error("quality SLO source snapshots unavailable");
    return withCors(NextResponse.json({
      ok: true,
      appended: result.appended,
      latest: {
        date: latest.date,
        passed: latest.passed,
        failures: latest.failures,
      },
      entries: result.entries,
    }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    console.warn("[fomo/cron/quality-slo] failed", error instanceof Error ? error.message : String(error));
    return withCors(NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500, headers: { "Cache-Control": "no-store" } }));
  }
}
