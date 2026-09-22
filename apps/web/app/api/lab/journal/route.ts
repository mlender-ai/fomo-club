/**
 * `GET /api/lab/journal` — 복기 탭 (UI-02 PART F).
 *
 * 화면의 가장 큰 숫자는 **누적 실현 손익**이다(UI-00 §4-2).
 *
 * 비용을 따로 낸다. `net = gross − costs` 인데 `net` 만 보이면 수수료·펀딩비가
 * 성과를 얼마나 먹었는지 안 보인다 — 무기한 선물에서 작은 항이 아니다.
 * 실측으로 **손실의 절반 가까이**가 비용이었다.
 */
import type { NextResponse } from "next/server";

import { readFceLedger } from "../../../../lib/lab/fce-board";
import { envelope } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return envelope(async () => {
    const ledger = await readFceLedger();
    return {
      ...ledger,
      /**
       * 전광판 N 과 이 표의 건수가 다를 수 있다. **어느 한쪽이 틀린 게 아니다** —
       * FCE 채점판은 검증 창 안에서 닫힌 거래만 센다(`all_closed_in_window`).
       */
      countNote:
        ledger.boardCount !== null && ledger.boardCount !== ledger.total.count
          ? "전광판은 검증 창 안에서 닫힌 거래만 센다. 이 표는 랩이 받아 쌓은 전부다. 두 수를 빼서 쓰지 않는다."
          : null,
    };
  });
}
