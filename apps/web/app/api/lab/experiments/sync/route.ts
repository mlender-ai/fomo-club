/**
 * `POST /api/lab/experiments/sync` — 러너(맥) → 랩 (ENG-02). 재판정 거르기 결과 · 그림자 거래 · FCE 정책 값.
 * 응답: 돌 그림자(`active` → 러너가 FCE `logs/shadows/active.json` 에 쓴다) · 거를 것(`filtering`) · 반영할 승인(`toApply`).
 */
import { NextResponse } from "next/server";

import { authorized } from "../../../../../lib/lab/auth";
import { syncExperiments, type SyncBody } from "../../../../../lib/lab/experiments-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as SyncBody | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  try {
    return NextResponse.json(await syncExperiments(body, new Date()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : "sync failed" }, { status: 500 });
  }
}
