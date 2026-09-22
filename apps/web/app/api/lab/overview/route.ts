/**
 * `GET /api/lab/overview` — Overview 탭 (UI-02 PART F).
 *
 * 화면의 가장 큰 숫자는 **총 자산**이다(UI-00 §4-2). 트랙당 $10,000 환산이고,
 * 원래 금액은 각 트랙 행에 병기된다(UI-02 C-3).
 *
 * 자본 곡선은 **되만든 값**이다 — FCE 에 이력이 없다. `reconstructed` 를 같이
 * 실어 화면이 그 사실을 띄우게 한다.
 */
import type { NextResponse } from "next/server";

import { readCapitalSeries } from "../../../../lib/lab/capital";
import { readFceBoard } from "../../../../lib/lab/fce-board";
import { buildPortfolio } from "../../../../lib/lab/portfolio";
import { prisma } from "../../../../lib/prisma";
import { envelope } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return envelope(async () => {
    const board = await readFceBoard();
    const portfolio = buildPortfolio(board.tracks);

    const [series, research] = await Promise.all([
      Promise.all(portfolio.tracks.map((t) => readCapitalSeries(t.key))),
      prisma.research.findMany({
        where: { status: { not: "closed" } },
        orderBy: { no: "asc" },
        select: { no: true, title: true, status: true, summary: true },
      }),
    ]);

    return {
      portfolio,
      series: series.filter((s) => s.points.length > 0),
      /** 열린 질문 요약. 연구 탭의 가장 큰 숫자가 이 수다. */
      research: { open: research.length, items: research.slice(0, 5) },
      positions: board.positions.length,
      freshness: board.freshness,
    };
  });
}
