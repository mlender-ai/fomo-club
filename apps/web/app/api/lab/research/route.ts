/**
 * `GET /api/lab/research` — 연구 탭 (UI-02 PART E · F).
 *
 * 화면의 가장 큰 숫자는 **열린 질문 수**다(UI-00 §4-2).
 *
 * 닫힌 항목도 같이 낸다. **지우지 않는다** — 진 질문이 남아 있어야 같은 걸 다시
 * 묻지 않는다.
 */
import type { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { envelope } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return envelope(async () => {
    const items = await prisma.research.findMany({
      orderBy: { no: "asc" },
      select: {
        no: true,
        title: true,
        status: true,
        verdict: true,
        summary: true,
        blocks: true,
        openedAt: true,
        closedAt: true,
        trackKeys: true,
      },
    });

    return {
      items,
      open: items.filter((i) => i.status === "open" || i.status === "testing").length,
      blocked: items.filter((i) => i.status === "blocked").length,
      closed: items.filter((i) => i.status === "closed").length,
      /** 무엇이 막혀 있나. 화면이 위에 띄운다. */
      blockers: items
        .filter((i) => i.status === "blocked" && i.blocks)
        .map((i) => ({ no: i.no, title: i.title, blocks: i.blocks })),
    };
  });
}
