import { NextRequest, NextResponse } from "next/server";
import { challengePointsFor } from "@fomo/core";
import { prisma } from "../../../../lib/prisma";
import { kstDate, corsJson, withCors } from "../../../../lib/fomo";
import { extractBearerToken, verifyToken } from "@/lib/tarot/jwt";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

interface ChallengeBody {
  sessionId?: string;
  action?: string;
  userId?: string;
  date?: string;
}

/** 세션 전체 누적 포인트 (정직한 숫자: 실제 적립 합계). */
async function totalPointsFor(sessionId: string): Promise<number> {
  const agg = await prisma.challengeState.aggregate({
    where: { sessionId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

/** 챌린지 상태 응답 직렬화. */
function serializeStatus(
  date: string,
  row: { accepted: boolean; completed: boolean; points: number } | null,
  totalPoints: number
) {
  return {
    date,
    accepted: row?.accepted ?? false,
    completed: row?.completed ?? false,
    points: row?.points ?? 0,
    totalPoints,
  };
}

// GET /api/fomo/challenges?sessionId=...&date=YYYY-MM-DD
// 사용자(세션)의 해당 날짜 챌린지 수락/완료 상태 + 누적 포인트 반환.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId")?.trim();
    const date = url.searchParams.get("date")?.trim() || kstDate();

    if (!sessionId) {
      return corsJson({ error: "sessionId 필요", code: "MISSING_SESSION" }, { status: 400 });
    }

    const row = await prisma.challengeState.findUnique({
      where: { sessionId_challengeDate: { sessionId, challengeDate: date } },
    });
    const totalPoints = await totalPointsFor(sessionId);
    return corsJson(serializeStatus(date, row, totalPoints));
  } catch (err) {
    console.warn("[fomo/challenges] GET error", err);
    return corsJson({ error: "상태 조회 실패", code: "STATUS_ERROR" }, { status: 500 });
  }
}

// POST /api/fomo/challenges — action="accept" | "complete"
// accept: 챌린지 수락 상태로 전이.
// complete: 수락된 챌린지를 완료 처리하고 포인트 적립(중복 적립 방지).
export async function POST(req: NextRequest) {
  const fallbackDate = kstDate();
  try {
    const body = (await req.json().catch(() => ({}))) as ChallengeBody;
    const sessionId = body.sessionId?.trim();
    const action = body.action;
    const date = body.date?.trim() || fallbackDate;

    if (!sessionId) {
      return corsJson({ error: "sessionId 필요", code: "MISSING_SESSION" }, { status: 400 });
    }
    if (action !== "accept" && action !== "complete") {
      return corsJson(
        { error: "action은 accept|complete 중 하나", code: "BAD_ACTION" },
        { status: 400 }
      );
    }

    // 로그인 상태면 Bearer 토큰의 userId를 우선(클라 위조 방지), 없으면 body.userId 폴백.
    const tokenUserId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
    const userId = tokenUserId ?? body.userId ?? null;

    const key = { sessionId_challengeDate: { sessionId, challengeDate: date } };

    if (action === "accept") {
      const row = await prisma.challengeState.upsert({
        where: key,
        create: {
          sessionId,
          challengeDate: date,
          userId,
          accepted: true,
          acceptedAt: new Date(),
        },
        // 이미 수락/완료된 상태는 보존(멱등) — userId만 보강.
        update: { ...(userId ? { userId } : {}) },
      });
      const totalPoints = await totalPointsFor(sessionId);
      return corsJson(serializeStatus(date, row, totalPoints));
    }

    // action === "complete"
    const existing = await prisma.challengeState.findUnique({ where: key });
    if (!existing || !existing.accepted) {
      return corsJson(
        { error: "수락되지 않은 챌린지", code: "NOT_ACCEPTED" },
        { status: 409 }
      );
    }

    // 이미 완료된 경우 중복 적립 방지 — 현재 상태 그대로 반환.
    if (existing.completed) {
      const totalPoints = await totalPointsFor(sessionId);
      return corsJson(serializeStatus(date, existing, totalPoints));
    }

    const points = challengePointsFor(true);
    const row = await prisma.challengeState.update({
      where: key,
      data: {
        completed: true,
        completedAt: new Date(),
        points,
        ...(userId ? { userId } : {}),
      },
    });
    const totalPoints = await totalPointsFor(sessionId);
    return corsJson(serializeStatus(date, row, totalPoints));
  } catch (err) {
    console.warn("[fomo/challenges] POST error", err);
    return corsJson({ error: "상태 변경 실패", code: "MUTATION_ERROR" }, { status: 500 });
  }
}
