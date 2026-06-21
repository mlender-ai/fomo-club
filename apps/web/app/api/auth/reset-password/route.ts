import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";
import { createLogger } from "../../../../lib/logger";
import { hashResetToken, tokenStore } from "../../../../lib/passwordResetStore";
import {
  BCRYPT_MAX_PASSWORD_BYTES,
  exceedsBcryptPasswordLimit,
} from "../../../../lib/auth/passwordPolicy";

const log = createLogger("auth/reset-password");

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST = 12;

function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  }
  if (exceedsBcryptPasswordLimit(password)) {
    return `비밀번호는 UTF-8 기준 ${BCRYPT_MAX_PASSWORD_BYTES}바이트 이하여야 합니다.`;
  }
  if (!/[A-Z]/.test(password)) return "대문자를 1자 이상 포함해야 합니다.";
  if (!/[0-9]/.test(password)) return "숫자를 1자 이상 포함해야 합니다.";
  return null;
}

export async function POST(req: NextRequest) {
  let token: string | undefined;
  let newPassword: string | undefined;
  try {
    const body = await req.json();
    token       = typeof body?.token === "string"       ? body.token.trim()  : undefined;
    newPassword = typeof body?.newPassword === "string" ? body.newPassword   : undefined;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (!token || !newPassword) {
    return NextResponse.json({ error: "token과 newPassword는 필수입니다." }, { status: 400 });
  }

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const tokenKey = hashResetToken(token);
  const entry = tokenStore.get(tokenKey);
  if (!entry) {
    log.warn("reset-password: token not found");
    return NextResponse.json({ error: "유효하지 않은 재설정 링크입니다." }, { status: 400 });
  }

  if (entry.used) {
    log.warn("reset-password: token already used", { email: entry.email });
    return NextResponse.json({ error: "이미 사용된 재설정 링크입니다." }, { status: 400 });
  }

  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(tokenKey);
    log.warn("reset-password: token expired", { email: entry.email });
    return NextResponse.json({ error: "재설정 링크가 만료되었습니다. 다시 요청해주세요." }, { status: 400 });
  }

  // 1회 사용 즉시 만료 처리 (재사용 방지)
  entry.used = true;

  // 로그인 경로와 동일한 bcrypt 포맷으로 저장한다. 원문은 DB·로그에 남기지 않는다.
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  await prisma.user.update({
    where: { email: entry.email },
    data: { passwordHash },
  });

  tokenStore.delete(tokenKey);
  log.info("password reset successful", { email: entry.email });

  return NextResponse.json({ ok: true });
}
