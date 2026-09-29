/**
 * `GET /api/lab/experiments` — 연구 탭 "실험 중" (ENG-02 H). 누적 시도 수 · 진행 · 판정 뒤 결과.
 * **판정 전에는 결과 숫자를 싣지 않는다** — 중간에 보고 흔들리지 않게.
 */
import { NextResponse } from "next/server";

import { experimentsView } from "../../../../lib/lab/experiments-run";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ data: await experimentsView() }, { headers: { "cache-control": "no-store" } });
}
