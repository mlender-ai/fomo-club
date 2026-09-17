import { NextResponse } from "next/server";

import { findForbiddenKeys } from "@fomo/lab";

import { readLiveBoard } from "../../../../lib/lab/live-board";

/**
 * 전광판 — 화면이 **1분마다** 이걸 다시 읽는다(PART D).
 *
 * 나가기 전에 **청산 조건이 섞였는지 확인한다**(PART B-2). 섞였으면 조용히 지우지 않고
 * 500 을 낸다 — 지우면 다음에 또 들어오고 그때는 아무도 모른다. 화면이 잠깐 비는 쪽이
 * 손절선을 흘리는 것보다 낫다.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const board = await readLiveBoard();

  const leaked = findForbiddenKeys(board);
  if (leaked.length > 0) {
    console.error(`[lab/live] 응답에 청산 조건이 섞였다: ${leaked.join(", ")}`);
    return NextResponse.json(
      { error: "leak", keys: leaked },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}
