/**
 * `GET /api/lab/positions` — 포지션 탭 (UI-02 PART F).
 *
 * 화면의 가장 큰 숫자는 **미실현 손익 합계**다(UI-00 §4-2).
 *
 * ## 청산 수준을 숨기지 않는다
 *
 * FCE 에 청산 모델이 없어 손익률이 −100% 아래로 갈 수 있다. 실제 거래소였으면
 * 증거금이 이미 없어진 자리다 — `liquidationLevel` 을 그대로 실어 화면이 경고를
 * 달게 한다(LAB-BRIDGE PART D-1).
 */
import type { NextResponse } from "next/server";

import { readFceBoard } from "../../../../lib/lab/fce-board";
import { envelope } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return envelope(async () => {
    const board = await readFceBoard();
    const positions = board.positions;

    // 증거금 대비 손익률과 증거금이 있으면 금액을 낼 수 있다. **모르면 null 이다.**
    const unrealized = positions.reduce((sum, p) => {
      if (p.netReturnPct === null || p.marginUsdt === null) return sum;
      return sum + (p.marginUsdt * p.netReturnPct) / 100;
    }, 0);
    const measurable = positions.filter(
      (p) => p.netReturnPct !== null && p.marginUsdt !== null
    ).length;

    return {
      positions,
      /** 손익률·증거금을 둘 다 아는 포지션만 더한 값. */
      unrealizedUsdt: measurable > 0 ? unrealized : null,
      measurable,
      total: positions.length,
      liquidationLevel: positions.filter((p) => p.liquidationLevel).length,
      /** 화면이 그대로 옮길 한계. **지우지 않는다.** */
      caveat:
        "손익은 증거금 대비다. FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다 — 실제 거래소였으면 그 전에 증거금이 없어진다.",
    };
  });
}
