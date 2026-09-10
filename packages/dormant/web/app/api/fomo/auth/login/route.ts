import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { issueToken } from "@/lib/auth/jwt";
import { exceedsBcryptPasswordLimit } from "@/lib/auth/passwordPolicy";

export const dynamic = "force-dynamic";

// 타이밍 균일화용 고정 더미 해시(cost 10) — 실제 계정과 무관, 어떤 비밀번호와도 일치하지 않음.
const DUMMY_BCRYPT_HASH = "$2b$10$C6UzMDM.H6dfI/f/IKcEeO6cBmOQdD3jH9M4qzYlrx1PBGU0y0e6a";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// 트랙 B — 이메일+비밀번호 로그인. 소셜은 추후 provider 분기로 확장(User.authProvider 그릇 준비됨).
// 보안: 이메일 존재 여부를 노출하지 않게 실패 메시지를 통일(계정 열거 방지).
interface Body {
  email?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return corsJson({ error: "이메일과 비밀번호를 입력해줘.", code: "MISSING" }, { status: 400 });
    }
    if (exceedsBcryptPasswordLimit(password)) {
      return corsJson({ error: "이메일 또는 비밀번호가 맞지 않아.", code: "BAD_CREDENTIALS" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // 미존재 계정도 동일 비용의 해시 비교를 수행 — 응답시간 차로 계정 존재가 새는 것 방지(계정 열거 차단의 짝).
    const ok = user?.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : (await bcrypt.compare(password, DUMMY_BCRYPT_HASH), false);
    if (!user || !ok) {
      return corsJson({ error: "이메일 또는 비밀번호가 맞지 않아.", code: "BAD_CREDENTIALS" }, { status: 401 });
    }

    const token = issueToken(user.id);
    return corsJson({ token, user: { id: user.id, displayName: user.displayName, isNew: false } });
  } catch (err) {
    console.warn("[fomo/auth/login] error", err);
    return corsJson({ error: "로그인에 실패했어. 잠시 후 다시 시도해줘.", code: "LOGIN_ERROR" }, { status: 500 });
  }
}
