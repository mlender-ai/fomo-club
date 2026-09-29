/**
 * `POST /api/lab/experiments/decision` — 텔레그램 `/approve N` · `/reject N 사유`(FCE 봇이 기록 → 러너가 옮긴다).
 * **승인은 통과(`awaiting`)에서만** — 여기서도 본 트랙을 바꾸지 않는다. 반영은 러너가 새 정책 버전을 쓴 뒤 `applied`.
 */
import { NextResponse } from "next/server";

import { authorized } from "../../../../../lib/lab/auth";
import { decideExperiment } from "../../../../../lib/lab/experiments-run";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { number?: number; action?: string; reason?: string } | null;
  if (!body || typeof body.number !== "number" || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }
  return NextResponse.json(await decideExperiment(body.number, body.action, String(body.reason ?? ""), new Date()));
}
