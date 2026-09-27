/**
 * `GET /api/lab/journal/{id}` — 거래 상세 (UI-09 PART B).
 *
 * 복기 조립본에서 행을, `journalExtra` 에서 그 거래의 "왜" 와 사후 채점을 골라낸다 — **쿼리 한 번**(`readSnapshots`).
 * 캔들은 여기 없다 — 화면이 Bitget 공개 시세에서 그 창만 받는다(`useBitgetCandles`).
 */
import { NextResponse } from "next/server";

import { journalDetail } from "../../../../../lib/lab/journal";
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
  const snaps = await readSnapshots<{ journal: Payloads["journal"]; journalExtra: Payloads["journalExtra"] }>([
    "journal",
    "journalExtra",
  ]);
  const list = snaps.journal;
  if (!list || list === "outdated") {
    return NextResponse.json(
      {
        error: "not_built",
        hint: list === "outdated" ? "조립본이 옛 형식이라 다시 만드는 중이다" : "FCE 업로드가 한 번도 돌지 않았다",
      },
      { status: 503 }
    );
  }
  const row = list.payload.rows.find((r) => r.id === id);
  if (!row) return NextResponse.json({ error: "not_found", id }, { status: 404 });
  const extra = snaps.journalExtra && snaps.journalExtra !== "outdated" ? snaps.journalExtra.payload : null;

  return NextResponse.json(
    {
      data: journalDetail(row, extra),
      sync: syncFromSeed(list.sync),
      builtAt: list.builtAt.toISOString(),
      ms: Date.now() - started,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
