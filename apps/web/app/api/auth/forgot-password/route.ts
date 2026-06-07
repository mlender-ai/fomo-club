import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { createLogger } from "../../../../lib/logger";
import { tokenStore } from "../../../../lib/passwordResetStore";

const log = createLogger("auth/forgot-password");

// OTP 유효 시간: 10분
const OTP_TTL_MS = 10 * 60 * 1000;
// 단순 인메모리 rate limit (프로세스 재시작 시 초기화됨 — 프로덕션은 Redis 필요)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15분

function generateOtp(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(identifier, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  let email: string | undefined;
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "이메일 주소를 확인해주세요." }, { status: 400 });
  }

  // 요청 IP 기반 rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`${ip}:${email}`)) {
    log.warn("rate limit exceeded", { ip, email });
    return NextResponse.json(
      { error: "잠시 후 다시 시도해주세요. (15분 내 최대 3회)" },
      { status: 429 }
    );
  }

  // 사용자 존재 여부 — 동일 응답으로 이메일 열거 공격 방지
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    log.debug("forgot-password: user not found — silent success", { email });
    // 사용자에게는 항상 동일 메시지 반환 (계정 존재 여부 노출 금지)
    return NextResponse.json({ ok: true });
  }

  const token = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;
  // 이전 미사용 토큰 제거 (1 계정 1 활성 토큰)
  for (const [k, v] of tokenStore) {
    if (v.email === email && !v.used) tokenStore.delete(k);
  }
  tokenStore.set(token, { email, expiresAt, used: false });

  log.info("password reset token issued", { email, expiresAt: new Date(expiresAt).toISOString() });

  // 실제 이메일 발송은 외부 서비스 연동 필요 (예: Resend, SendGrid).
  // 프로덕션: 이메일에 아래 형태로 발송, 피싱 방지 문구 포함 필수.
  // "링크: https://fomo-club.com/reset-password?token=<token>"
  // "이 링크는 fomo-club.com 도메인에서만 유효합니다. 본인이 요청하지 않았다면 무시하세요."
  log.debug("reset token (dev only — remove before prod)", { token });

  return NextResponse.json({ ok: true });
}
