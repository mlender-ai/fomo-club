import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "../../../../../lib/admin-jwt";
import { writeAuditLog, getRequestMeta } from "../../../../../lib/admin-audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { ip, userAgent } = getRequestMeta(request);

  // 현재 토큰 검증 (유효한 세션에서만 로그아웃 로그 기록)
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (token) {
    const payload = await verifyAdminToken(token);
    if (payload) {
      await writeAuditLog({ action: "admin.logout", ip, userAgent });
    }
  }

  const response = NextResponse.json({ ok: true });
  // 쿠키 만료 (즉시)
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
