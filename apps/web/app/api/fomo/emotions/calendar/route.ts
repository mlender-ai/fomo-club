import { NextRequest, NextResponse } from "next/server";
import { type EmotionType } from "@fomo/core";
import { prisma } from "../../../../../lib/prisma";
import { kstDate, corsJson, withCors, isEmotionType } from "../../../../../lib/fomo";
import { extractBearerToken, verifyToken } from "@/lib/tarot/jwt";

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

    // 소프트 인증: Bearer 있으면 userId 해석 → 익명(sessionId) + 연결분(userId)을 합쳐 조회.
    // 토큰 없으면 기존 익명 동작 그대로(sessionId만).
    const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
    const ownerWhere = userId
      ? { OR: [{ userId }, { sessionId }] }
      : { sessionId };

    const votes = await prisma.emotionVote.findMany({
      where: { ...ownerWhere, votedDate: { gte: prevLo, lt: hi } },
      select: { votedDate: true, emotion: true },
    });

    // FomoIndexSnapshot 테이블이 DB에 없을 수 있음(마이그레이션 미적용) → 실패해도 감정 데이터는 반환
    let snaps: { date: string; score: number }[] = [];
    try {
      snaps = await prisma.fomoIndexSnapshot.findMany({
        where: { date: { gte: lo, lt: hi } },
        select: { date: true, score: true },
      });
    } catch {
      // 테이블 미존재 시 market 오버레이 없이 진행
    }

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
