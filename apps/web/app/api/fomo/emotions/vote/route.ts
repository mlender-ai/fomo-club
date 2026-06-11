import { NextRequest, NextResponse } from "next/server";
import { EMOTION_TYPES, isSituationKey, isResolveKey } from "@fomo/core";
import { prisma } from "../../../../../lib/prisma";
import { kstDate, todayTally, isEmotionType, corsJson, withCors } from "../../../../../lib/fomo";
import { extractBearerToken, verifyToken } from "@/lib/tarot/jwt";
import { isValidSessionIdFormat, verifySession } from "@/lib/session-hmac";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

interface VoteBody {
  sessionId?: string;
  /** HMAC 서명 (이슈 #426, Phase 1 — 미제공 시 통과). */
  sessionSignature?: string;
  emotion?: string;
  source?: string;
  userId?: string;
  /** M4 구조화 한마디 (opt-in) — @fomo/core 선택지 키만 저장, 그 외 무시. */
  situationKey?: string;
  resolveKey?: string;
}

// POST /api/fomo/emotions/vote — 감정 투표 (sessionId + emotion). 무가입 허용, 1세션 1일 1회.
export async function POST(req: NextRequest) {
  const date = kstDate();
  try {
    const body = (await req.json().catch(() => ({}))) as VoteBody;
    const sessionId = body.sessionId?.trim();
    const emotion = body.emotion;
    const source = body.source === "mobile" ? "mobile" : "web";

    if (!sessionId) {
      return corsJson({ error: "sessionId 필요", code: "MISSING_SESSION" }, { status: 400 });
    }
    // sessionId 형식 검사 (이슈 #426)
    if (!isValidSessionIdFormat(sessionId)) {
      console.warn("[fomo/vote] invalid sessionId format", { sessionId: sessionId.slice(0, 8) });
      return corsJson({ error: "세션 형식이 유효하지 않습니다", code: "INVALID_SESSION_FORMAT" }, { status: 400 });
    }
    // HMAC 서명 검증 — 불일치 시 위변조로 간주하고 거부 (이슈 #426)
    const { tampered } = verifySession(sessionId, body.sessionSignature);
    if (tampered) {
      console.warn("[fomo/vote] session signature mismatch — potential tampering", {
        sessionId: sessionId.slice(0, 8),
      });
      return corsJson({ error: "세션이 유효하지 않습니다", code: "TAMPERED_SESSION" }, { status: 403 });
    }
    if (!isEmotionType(emotion)) {
      return corsJson(
        { error: `emotion은 ${EMOTION_TYPES.join("|")} 중 하나`, code: "BAD_EMOTION" },
        { status: 400 }
      );
    }

    // 로그인 상태면 Bearer 토큰의 userId를 우선(클라 위조 방지), 없으면 body.userId 폴백.
    const tokenUserId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
    const userId = tokenUserId ?? body.userId ?? null;

    // M4 구조화 한마디 — 두 키가 모두 유효할 때만 저장(가드레일의 서버측 짝).
    const hasVoice = isSituationKey(body.situationKey) && isResolveKey(body.resolveKey);
    const voiceFields = hasVoice
      ? { situationKey: body.situationKey!, resolveKey: body.resolveKey! }
      : {};

    // 1세션 1일 1회 — 같은 날 재투표는 감정만 갱신(@@unique([sessionId, votedDate]))
    // select:{id} — DB에 voice 컬럼이 아직 없어도(migration 전) 기존 투표가 깨지지 않게
    // 새 컬럼을 RETURNING에서 제외한다(우아한 성능저하).
    await prisma.emotionVote.upsert({
      where: { sessionId_votedDate: { sessionId, votedDate: date } },
      create: { sessionId, emotion, source, votedDate: date, userId, ...voiceFields },
      update: { emotion, source, ...(userId ? { userId } : {}), ...voiceFields },
      select: { id: true },
    });

    const { tally, total } = await todayTally(date);
    const counts = Object.fromEntries(EMOTION_TYPES.map((e) => [e, tally[e] ?? 0]));
    const ratios = Object.fromEntries(
      EMOTION_TYPES.map((e) => [e, total > 0 ? Math.round(((tally[e] ?? 0) / total) * 100) : 0])
    );
    return corsJson({ ok: true, mine: emotion, date, total, counts, ratios });
  } catch (err) {
    console.warn("[fomo/emotions/vote] error", err);
    return corsJson({ error: "투표 저장 실패", code: "VOTE_ERROR" }, { status: 500 });
  }
}
