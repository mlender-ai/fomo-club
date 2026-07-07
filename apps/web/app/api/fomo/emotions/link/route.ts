import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";
import { isValidSessionIdFormat, verifySession } from "../../../../../lib/session-hmac";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

interface LinkBody {
  sessionId?: string;
  sessionSignature?: string;
}

// POST /api/fomo/emotions/link — 로그인 직후 익명 sessionId 기록을 userId로 연결.
// Bearer 필수. 가입 전 고른 감정이 캘린더에 그대로 이어지도록 한다(기록 손실 0).
export async function POST(req: NextRequest) {
  const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
  if (!userId) {
    return corsJson({ error: "Unauthorized", code: "NO_TOKEN" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as LinkBody;
    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return corsJson({ error: "sessionId 필요", code: "MISSING_SESSION" }, { status: 400 });
    }
    // vote 와 동일 게이트 — 임의 sessionId 를 알아내 타 세션 기록을 내 계정으로 흡수하는 것 차단.
    if (!isValidSessionIdFormat(sessionId)) {
      return corsJson({ error: "세션 형식이 유효하지 않습니다", code: "INVALID_SESSION_FORMAT" }, { status: 400 });
    }
    if (verifySession(sessionId, body.sessionSignature).tampered) {
      return corsJson({ error: "세션이 유효하지 않습니다", code: "TAMPERED_SESSION" }, { status: 403 });
    }

    // 아직 주인 없는(userId null) 익명 기록만 연결. 이미 다른 유저에 묶인 건 건드리지 않음.
    const result = await prisma.emotionVote.updateMany({
      where: { sessionId, userId: null },
      data: { userId },
    });

    return corsJson({ ok: true, linked: result.count });
  } catch (err) {
    console.warn("[fomo/emotions/link] error", err);
    return corsJson({ error: "연결 실패", code: "LINK_ERROR" }, { status: 500 });
  }
}
