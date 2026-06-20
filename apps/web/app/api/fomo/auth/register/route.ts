import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../../lib/prisma";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { issueToken } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// 트랙 B — 이메일+비밀번호 가입. JWT(issueToken)·User.passwordHash 재사용.
// 소셜 로그인 확장성: User.authProvider/authProviderId 필드가 이미 있어, 추후 구글/카카오는
// 별도 분기(provider 경로)로 같은 User 그릇에 얹는다 — 지금은 email+password 만.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface Body {
  email?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !EMAIL_RE.test(email)) {
      return corsJson({ error: "올바른 이메일을 입력해줘.", code: "BAD_EMAIL" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD) {
      return corsJson({ error: `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해.`, code: "WEAK_PASSWORD" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return corsJson({ error: "이미 가입된 이메일이야. 로그인해줘.", code: "EMAIL_TAKEN" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash } });
    const token = issueToken(user.id);

    return corsJson({ token, user: { id: user.id, displayName: user.displayName, isNew: true } });
  } catch (err) {
    console.warn("[fomo/auth/register] error", err);
    return corsJson({ error: "가입에 실패했어. 잠시 후 다시 시도해줘.", code: "REGISTER_ERROR" }, { status: 500 });
  }
}
