/**
 * `GET /api/lab/whales` — 고래 탭 (UI-02 PART F).
 *
 * 화면의 가장 큰 숫자는 **갭**이다(UI-00 §4-2). 다만 이 API 는 갭을 **빼서 주지
 * 않는다** — 두 승률을 따로 싣고, 무엇을 재는 수인지 같이 싣는다.
 *
 * > 두 수는 다른 거래 목록이다. 거래 집합·진입 시점·가격·사이징·청산·레버리지·
 * > 승패 판정이 전부 다르다.
 *
 * 화면이 33.4%p 를 크게 띄우더라도, 그게 **뺄셈이 아니라 두 질문의 답 두 개**라는
 * 것을 같이 말해야 한다. 그래서 `subtractable: false` 를 박아 보낸다.
 */
import type { NextResponse } from "next/server";

import { readFceBoard } from "../../../../lib/lab/fce-board";
import { envelope } from "../_shared";

export const dynamic = "force-dynamic";

/** FCE 온체인 리포트가 낸 값. 랩이 계산하지 않는다. */
const WHALE_OWN_WIN_PCT = 65.8;

export async function GET(): Promise<NextResponse> {
  return envelope(async () => {
    const board = await readFceBoard();
    const w = board.whale;
    if (!w) return { whale: null };

    return {
      whale: w,
      winRates: {
        whaleOwn: { value: WHALE_OWN_WIN_PCT, measures: "그 지갑의 온체인 체결 전부 — 고래의 자본·판단·출구" },
        ourFollow: {
          value: w.followWinPct,
          trades: w.followTrades,
          measures: "우리가 따라 들어간 거래 — 우리 사이징·우리 출구",
        },
        /** **빼면 안 된다.** 화면이 이 값을 보고 뺄셈을 막는다. */
        subtractable: false,
        note: "다른 모집단이다. 33.4%p 는 갭이 아니라 서로 다른 질문의 답 두 개다.",
      },
      causes: [
        { axis: "청산 규칙", measured: "고래 청산을 그대로 따랐다면 −49.58 (75건)", verdict: "원인 아님 — 따라가면 더 나빴다" },
        { axis: "진입 지연", measured: w.latency, verdict: "중앙값이 1분 안 — 약한 후보" },
        { axis: "진입 가격 드리프트", measured: w.drift, verdict: "손절폭 대비. p90 구간을 따로 볼 것" },
        { axis: "사이징", measured: null, verdict: "미측정" },
        { axis: "지갑 선정", measured: null, verdict: "미측정 — 리더보드에 재료 있음" },
      ],
    };
  });
}
