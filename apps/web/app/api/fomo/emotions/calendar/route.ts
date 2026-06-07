import { NextRequest, NextResponse } from "next/server";
import { type EmotionType } from "@fomo/core";
import { prisma } from "../../../../../lib/prisma";
import { kstDate, corsJson, withCors, isEmotionType } from "../../../../../lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// GET /api/fomo/emotions/calendar?sessionId=X&month=YYYY-MM
// 한 세션의 해당 월 감정 기록 + 같은 월 시장 FOMO Index 흐름(옅게 겹치기용).
// M2 — 매일 돌아올 이유(감정 캘린더). docs/IDENTITY_AND_MILESTONES.md §M2.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();
  const month = searchParams.get("month")?.trim() || kstDate().slice(0, 7);

  if (!sessionId) {
    return corsJson({ error: "sessionId 필요", code: "MISSING_SESSION" }, { status: 400 });
  }
  if (!MONTH_RE.test(month)) {
    return corsJson({ error: "month는 YYYY-MM 형식", code: "BAD_MONTH" }, { status: 400 });
  }

  try {
    const lo = `${month}-01`;
    const hi = `${month}-32`; // 문자열 사전순 상한 (해당 월 모든 일자 포함)

    // 내 감정 기록(스트릭은 월 경계를 넘어 셀 수 있어 직전 달까지 함께 조회).
    const { year, month: m } = { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? year - 1 : year;
    const prevLo = `${prevY}-${String(prevM).padStart(2, "0")}-01`;

    const [votes, snaps] = await Promise.all([
      prisma.emotionVote.findMany({
        where: { sessionId, votedDate: { gte: prevLo, lt: hi } },
        select: { votedDate: true, emotion: true },
      }),
      prisma.fomoIndexSnapshot.findMany({
        where: { date: { gte: lo, lt: hi } },
        select: { date: true, score: true },
      }),
    ]);

    const days: Record<string, EmotionType> = {};
    for (const v of votes) {
      if (isEmotionType(v.emotion)) days[v.votedDate] = v.emotion;
    }
    const market: Record<string, number> = {};
    for (const s of snaps) market[s.date] = s.score;

    return corsJson({ month, today: kstDate(), days, market });
  } catch (err) {
    console.warn("[fomo/emotions/calendar] error", err);
    return corsJson({ error: "캘린더 조회 실패", code: "CALENDAR_ERROR" }, { status: 500 });
  }
}
