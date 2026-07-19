import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { kstDate, withCors } from "@/lib/fomo";
import { materializeLedgerOutcomes } from "@/lib/ledger-track-record";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  try {
    const result = await materializeLedgerOutcomes();
    revalidateTag("judgment-ledger", { expire: 0 });
    return withCors(NextResponse.json({ ok: true, date: kstDate(), ...result }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    console.warn("[cron/ledger-outcomes] failed", error);
    return withCors(NextResponse.json({ ok: false, error: (error as Error)?.message ?? "outcome failed" }, { status: 500 }));
  }
}
