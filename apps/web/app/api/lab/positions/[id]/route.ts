/**
 * `GET /api/lab/positions/{id}` — 포지션 상세 (UI-02 PART F).
 *
 * 목록 조립본에서 골라낸다 — **쿼리 한 번**이다. 포지션은 많아야 수십 건이라
 * 따로 읽을 이유가 없다.
 *
 * 건강도 상세·무효화·익절·지금 볼 것·패턴 시간봉은 **아직 안 올라온다.**
 * 없는 것을 있는 척하지 않고 `missing` 에 적어 보낸다.
 */
import { NextResponse } from "next/server";

import { readSnapshot } from "../../../../../lib/lab/snapshot";
import { syncFromSeed } from "../../../../../lib/lab/sync";

export const dynamic = "force-dynamic";

interface PositionsPayload {
  positions: { id: string }[];
  caveat: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const started = Date.now();
  const { id } = await context.params;
  const snap = await readSnapshot<PositionsPayload>("positions");
  if (!snap || snap === "outdated") {
    return NextResponse.json(
      { error: "not_built", hint: snap === "outdated" ? "조립본이 옛 형식이라 다시 만드는 중이다" : undefined },
      { status: 503 }
    );
  }

  const position = snap.payload.positions.find((p) => p.id === id);
  if (!position) return NextResponse.json({ error: "not_found", id }, { status: 404 });

  return NextResponse.json(
    {
      data: {
        position,
        caveat: snap.payload.caveat,
        missing: ["healthDetail", "invalidation", "takeProfit", "watchNow", "patternTimeframes"],
      },
      sync: syncFromSeed(snap.sync),
      builtAt: snap.builtAt.toISOString(),
      ms: Date.now() - started,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
