import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { corsJson, withCors } from "../../../../lib/fomo";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// 트랙 B — 취향 학습 적재. 스와이프/깊이 신호를 유저별(로그인) 또는 익명 sessionId(가입 전)로 쌓는다.
// 익명 적재 먼저: Bearer 없으면 sessionId 로 저장 → 로그인 시 /emotions/link 식으로 연결(다음 Phase).
// 개인화 매칭(피드 재정렬)은 다음 트랙 — 여기선 수집·저장까지만.

const SUBJECT_TYPES = { theme: "THEME", stock: "STOCK" } as const;
const SIGNALS = {
  more: "MORE",
  less: "LESS",
  view_depth: "VIEW_DEPTH",
  tap_related: "TAP_RELATED",
} as const;

interface TasteBody {
  subjectType?: string;
  subject?: string;
  signal?: string;
  sessionId?: string;
}

export async function POST(req: NextRequest) {
  // 로그인 유저면 userId, 아니면 익명(sessionId). 둘 다 없으면 폐기(주인 식별 불가).
  const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");

  try {
    const body = (await req.json().catch(() => ({}))) as TasteBody;
    const subjectType = SUBJECT_TYPES[body.subjectType as keyof typeof SUBJECT_TYPES];
    const signal = SIGNALS[body.signal as keyof typeof SIGNALS];
    const subject = body.subject?.trim();
    const sessionId = body.sessionId?.trim() || null;

    if (!subjectType || !signal || !subject) {
      return corsJson({ error: "subjectType·subject·signal 필요", code: "BAD_INPUT" }, { status: 400 });
    }
    // 익명 적재라도 주인(userId 또는 sessionId)은 있어야 한다 — 둘 다 없으면 의미 없는 행.
    if (!userId && !sessionId) {
      return corsJson({ error: "userId 또는 sessionId 필요", code: "NO_OWNER" }, { status: 400 });
    }

    await prisma.tasteSignal.create({
      data: { userId: userId || null, sessionId: userId ? null : sessionId, subjectType, subject, signal },
    });

    return corsJson({ ok: true });
  } catch (err) {
    console.warn("[fomo/taste] error", err);
    return corsJson({ error: "기록 실패", code: "TASTE_ERROR" }, { status: 500 });
  }
}
