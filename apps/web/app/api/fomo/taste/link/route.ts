import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

interface LinkBody {
  sessionId?: string;
}

// 트랙 B — 로그인 직후 익명 sessionId 로 쌓인 취향 신호를 내 계정으로 연결(가입 전 학습 보존).
// emotions/link 와 동형. 아직 주인 없는(userId null) 행만 연결 — 이미 다른 유저에 묶인 건 안 건드림.
export async function POST(req: NextRequest) {
  const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
  if (!userId) {
    return corsJson({ error: "로그인이 필요해.", code: "NO_TOKEN" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as LinkBody;
    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return corsJson({ error: "sessionId 필요", code: "MISSING_SESSION" }, { status: 400 });
    }
    const result = await prisma.tasteSignal.updateMany({
      where: { sessionId, userId: null },
      data: { userId, sessionId: null },
    });
    return corsJson({ ok: true, linked: result.count });
  } catch (err) {
    console.warn("[fomo/taste/link] error", err);
    return corsJson({ error: "연결 실패", code: "LINK_ERROR" }, { status: 500 });
  }
}
