/**
 * `GET /api/lab/strategies` — 전략 탭 (UI-02 PART F).
 *
 * **FCE 트랙이 곧 전략이다.** 랩 자체 전략 3종은 폐기됐고(LAB-BRIDGE 0-3) 결과는
 * 백테스트 보관함에 남는다.
 *
 * 화면의 가장 큰 숫자는 "1위 전략의 수익/낙폭" 인데, **기준선을 넘은 것이 없으면
 * 그렇게 말한다**(UI-00 §4-2). 그 판단 재료를 여기서 같이 낸다.
 */
import type { NextResponse } from "next/server";

import { readFceBoard } from "../../../../lib/lab/fce-board";
import { buildPortfolio } from "../../../../lib/lab/portfolio";
import { envelope } from "../_shared";

export const dynamic = "force-dynamic";

/** `LAB-00 §7` — 표본 30 미만은 순위 없음. */
const MIN_SAMPLE = 30;

export async function GET(): Promise<NextResponse> {
  return envelope(async () => {
    const board = await readFceBoard();
    const portfolio = buildPortfolio(board.tracks);

    const rows = board.tracks.map((t) => {
      const ranked = (t.trades ?? 0) >= MIN_SAMPLE;
      const beatsBenchmark =
        t.returnPct !== null && t.benchmarkReturnPct !== null
          ? t.returnPct > t.benchmarkReturnPct
          : null;
      return {
        key: t.key,
        label: t.label,
        returnPct: t.returnPct,
        mddPct: t.mddPct,
        // 수익/낙폭. 낙폭이 0 이면 나눌 수 없다 — **Infinity 를 만들지 않는다.**
        returnOverMdd:
          t.returnPct !== null && t.mddPct !== null && Math.abs(t.mddPct) > 1e-9
            ? t.returnPct / Math.abs(t.mddPct)
            : null,
        trades: t.trades,
        winRatePct: t.winRatePct,
        profitFactor: t.profitFactor,
        leverage: t.leverage,
        status: t.status,
        statusReason: t.statusReason,
        sampleNote: t.sampleNote,
        benchmarkLabel: t.benchmarkLabel,
        benchmarkReturnPct: t.benchmarkReturnPct,
        elapsedDays: t.elapsedDays,
        calendarDays: t.calendarDays,
        ranked,
        beatsBenchmark,
      };
    });

    return {
      rows,
      /** 기준선을 넘은 트랙 수. 0 이면 화면이 순위를 매기지 않는다. */
      beatCount: rows.filter((r) => r.beatsBenchmark === true).length,
      /** 표본이 찬 트랙 수. */
      rankableCount: rows.filter((r) => r.ranked).length,
      minSample: MIN_SAMPLE,
      portfolio,
    };
  });
}
