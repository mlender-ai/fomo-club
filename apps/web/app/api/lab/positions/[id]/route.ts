/**
 * `GET /api/lab/positions/{id}` — 포지션 상세 (UI-02 PART F).
 *
 * 지금은 랩이 가진 것만 낸다. **건강도·무효화·익절·지금 볼 것·패턴 시간봉은
 * 아직 안 올라온다** — `UI-02 B-1` 이 30초 주기로 올리라고 한 항목이고, 업로더
 * 확장은 `UI-06`(포지션 탭)과 같이 간다.
 *
 * 없는 것을 있는 척하지 않는다. `available` 에 무엇이 아직 없는지 적어 보낸다.
 */
import { NextResponse } from "next/server";

import { readFceBoard } from "../../../../../lib/lab/fce-board";
import { envelope } from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const board = await readFceBoard();
  const position = board.positions.find((p) => p.id === id);
  if (!position) {
    return NextResponse.json({ error: "not_found", id }, { status: 404 });
  }
  return envelope(async () => ({
    position,
    /** 아직 안 올라온 것. 화면이 빈 칸을 지어내지 않게. */
    missing: ["healthDetail", "invalidation", "takeProfit", "watchNow", "patternTimeframes"],
  }));
}
