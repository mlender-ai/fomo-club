import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/tarot/prisma";
import { issueToken } from "@/lib/tarot/jwt";
import { grantSignupBonus, getCreditBalance } from "@/lib/tarot/credits";
import { verifyAppleIdentityToken, verifyGoogleIdToken } from "@/lib/tarot/socialAuth";
import type { TarotAuthProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

interface LoginBody {
  provider?: string;
  identityToken?: string;   // Apple: identity_token / Google: id_token
  displayName?: string;
}

function errorJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as LoginBody;
  const provider = body.provider?.toUpperCase();
  const identityToken = body.identityToken?.trim();

  if (!identityToken) return errorJson("identityToken is required", "MISSING_TOKEN", 400);
  if (provider !== "APPLE" && provider !== "GOOGLE") {
    return errorJson("provider must be APPLE or GOOGLE", "INVALID_PROVIDER", 400);
  }

  // 소셜 토큰 서버 검증
  let sub: string;
  let email: string | undefined;

  try {
    if (provider === "APPLE") {
      ({ sub, email } = await verifyAppleIdentityToken(identityToken));
    } else {
      ({ sub, email } = await verifyGoogleIdToken(identityToken));
    }
  } catch (err) {
    console.error("[tarot/auth] token verification failed:", err);
    return errorJson("Invalid identity token", "INVALID_TOKEN", 401);
  }

  const authProvider = provider as TarotAuthProvider;

  // upsert — 신규면 생성, 기존이면 lastSeen 업데이트
  const isNew = !(await prisma.user.findUnique({
    where: { authProvider_authProviderId: { authProvider, authProviderId: sub } },
    select: { id: true },
  }));

  const user = await prisma.user.upsert({
    where: { authProvider_authProviderId: { authProvider, authProviderId: sub } },
    create: {
      authProvider,
      authProviderId: sub,
      email: email ?? null,
      displayName: body.displayName ?? null,
      membershipStatus: "FREE",
    },
    update: {
      ...(email !== undefined ? { email } : {}),
    },
    select: { id: true, displayName: true, membershipStatus: true },
  });

  // 신규 가입 시 크레딧 보너스 지급
  if (isNew) {
    await grantSignupBonus(user.id);
  }

  const credits = await getCreditBalance(user.id);
  const token = issueToken(user.id);

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      displayName: user.displayName,
      membershipStatus: user.membershipStatus,
      credits,
      isNew,
    },
  });
}
