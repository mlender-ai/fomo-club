import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { signAdminToken, COOKIE_NAME } from "../../../../../lib/admin-jwt";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  getClientIp,
} from "../../../../../lib/admin-rate-limit";
import { writeAuditLog, getRequestMeta } from "../../../../../lib/admin-audit";

export const dynamic = "force-dynamic";

// 응답 시간을 일정하게 유지해 타이밍 공격 방어 (최소 300ms)
async function withMinDelay<T>(fn: () => Promise<T>, minMs = 300): Promise<T> {
  const [result] = await Promise.all([fn(), new Promise((r) => setTimeout(r, minMs))]);
  return result;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { ip: reqIp, userAgent } = getRequestMeta(request);

  // 1. Rate limit 확인
  const rateLimit = await checkLoginRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many failed attempts. Try again later.",
        code: "RATE_LIMITED",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  // 2. 요청 파싱
  const body = await request.json().catch(() => ({})) as { password?: string };
  const password = typeof body.password === "string" ? body.password : "";

  // 3. 비밀번호 검증 (bcrypt hash 비교, 타이밍 일정화)
  const passwordHash = process.env.ADMIN_PASSWORD_HASH ?? "";
  const isValid = await withMinDelay(() =>
    passwordHash ? compare(password, passwordHash) : Promise.resolve(false)
  );

  if (!isValid) {
    await recordLoginAttempt(ip, false);
    await writeAuditLog({
      action: "admin.login_failed",
      ip: reqIp,
      userAgent,
    });
    // 남은 시도 횟수는 노출하되, 구체적 이유는 숨긴다 (사용자 열거 방지)
    return NextResponse.json(
      { error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
      { status: 401 }
    );
  }

  // 4. JWT 발급
  const token = await signAdminToken();

  await recordLoginAttempt(ip, true);
  await writeAuditLog({ action: "admin.login", ip: reqIp, userAgent });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60, // 8시간 (초)
  });

  return response;
}
