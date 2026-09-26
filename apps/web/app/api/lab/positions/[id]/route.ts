/**
 * `GET /api/lab/positions/{id}` — 포지션 상세 (UI-02 PART F · UI-06 PART B).
 *
 * 목록 조립본에서 포지션을, 캔들 조립본에서 그 심볼의 차트를 골라낸다 — **쿼리 한 번**이다
 * (`readSnapshots`). 포지션은 많아야 수십 건이라 따로 읽을 이유가 없다.
 *
 * FCE 가 라이브 계좌에만 붙이는 다섯 가지(건강도 · 지금 볼 것 · 유효 시간 · 패턴 시간봉 · 고래
 * 추적군)는 `liveOnly` 로 이름만 보낸다 — 없는 것을 있는 척하지 않는다(`lib/lab/positions.ts`).
 */
import { NextResponse } from "next/server";

import type { PositionDetail } from "../../../../../lib/lab/positions";
import type { Payloads } from "../../../../../lib/lab/snapshot";
import { readSnapshots } from "../../../../../lib/lab/snapshot";
import { syncFromSeed } from "../../../../../lib/lab/sync";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const started = Date.now();
  const { id } = await context.params;
  const snaps = await readSnapshots<{ positions: Payloads["positions"]; charts: Payloads["charts"] }>([
    "positions",
    "charts",
  ]);
  const list = snaps.positions;
  if (!list || list === "outdated") {
    return NextResponse.json(
      {
        error: "not_built",
        hint: list === "outdated" ? "조립본이 옛 형식이라 다시 만드는 중이다" : "FCE 업로드가 한 번도 돌지 않았다",
      },
      { status: 503 }
    );
  }

  const position = list.payload.positions.find((p) => p.id === id);
  if (!position) return NextResponse.json({ error: "not_found", id }, { status: 404 });
  const charts = snaps.charts && snaps.charts !== "outdated" ? snaps.charts.payload : null;

  const data: PositionDetail = {
    position,
    chart: charts?.bySymbol[position.symbol] ?? {},
    chartAsOf: charts?.asOf ?? null,
    caveat: list.payload.caveat,
    liveOnly: list.payload.liveOnly,
    lastAt: list.payload.lastAt,
  };
  return NextResponse.json(
    {
      data,
      sync: syncFromSeed(list.sync),
      builtAt: list.builtAt.toISOString(),
      ms: Date.now() - started,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
