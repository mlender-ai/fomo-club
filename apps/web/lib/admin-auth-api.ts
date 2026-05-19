import { NextResponse } from "next/server";
import { verifyAdminToken } from "./admin-jwt";

const COOKIE_NAME = "admin_token";

// 모든 /api/admin/* 라우트 핸들러 상단에서 호출
// 반환값: null = 인증 통과, NextResponse = 인증 실패 응답 (즉시 return)
export async function requireAdminApi(
  request: Request
): Promise<NextResponse | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = parseCookie(cookieHeader, COOKIE_NAME);

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "NO_SESSION" },
      { status: 401 }
    );
  }

  const payload = await verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "Unauthorized", code: "INVALID_SESSION" },
      { status: 401 }
    );
  }

  return null; // 통과
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
