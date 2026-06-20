import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { corsJson, withCors } from "../../../../lib/fomo";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// 트랙 B — 탈퇴(개인정보 게이트 최소 동작). 유저 삭제 시 TasteSignal 은 FK ON DELETE CASCADE 로 함께 삭제.
// 처리방침의 "탈퇴 시 데이터 삭제" 약속을 코드로 보장.
export async function DELETE(req: NextRequest) {
  const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
  if (!userId) {
    return corsJson({ error: "로그인이 필요해.", code: "NO_TOKEN" }, { status: 401 });
  }
  try {
    await prisma.user.delete({ where: { id: userId } });
    return corsJson({ ok: true });
  } catch (err) {
    console.warn("[fomo/account] delete error", err);
    return corsJson({ error: "탈퇴 처리에 실패했어.", code: "DELETE_ERROR" }, { status: 500 });
  }
}
