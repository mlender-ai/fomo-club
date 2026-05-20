import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/tarot/prisma";
import { issueToken, AUTH_COOKIE_NAME, cookieOptions, ACCESS_EXPIRY_MS } from "@/lib/tarot/jwt";
import { grantSignupBonus, getCreditBalance } from "@/lib/tarot/credits";
import { processLoginStreak } from "@/lib/tarot/streak";
import {
  verifyAppleIdentityToken,
  verifyGoogleIdToken,
  verifyKakaoAccessToken,
  verifyNaverAccessToken,
} from "@/lib/tarot/socialAuth";
import type { TarotAuthProvider } from "@prisma/client";

export const dynamic = "force-dynamic";

type SupportedProvider = "APPLE" | "GOOGLE" | "KAKAO" | "NAVER";

interface LoginBody {
  provider?: string;
  identityToken?: string; // Apple: identity_token / Google: id_token / Kakao+Naver: access_token
  displayName?: string;
}

function errorJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

function isSupportedProvider(p: string): p is SupportedProvider {
  return ["APPLE", "GOOGLE", "KAKAO", "NAVER"].includes(p);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as LoginBody;
  const provider = body.provider?.toUpperCase();
  const identityToken = body.identityToken?.trim();

  if (!identityToken) return errorJson("identityToken is required", "MISSING_TOKEN", 400);
  if (!provider || !isSupportedProvider(provider)) {
    return errorJson(
      "provider must be APPLE, GOOGLE, KAKAO, or NAVER",
      "INVALID_PROVIDER",
      400
    );
  }

  // 소셜 토큰 서버 검증
  let sub: string;
  let email: string | undefined;
  let displayNameFromProvider: string | undefined;

  try {
    switch (provider) {
      case "APPLE": {
        ({ sub, email } = await verifyAppleIdentityToken(identityToken));
        break;
      }
      case "GOOGLE": {
        ({ sub, email } = await verifyGoogleIdToken(identityToken));
        break;
      }
      case "KAKAO": {
        ({ sub, email } = await verifyKakaoAccessToken(identityToken));
        break;
      }
      case "NAVER": {
        const result = await verifyNaverAccessToken(identityToken);
        sub = result.sub;
        email = result.email;
        displayNameFromProvider = result.name;
        break;
      }
    }
  } catch (err) {
    console.error(`[tarot/auth] ${provider} token verification failed:`, err);
    return errorJson("Invalid identity token", "INVALID_TOKEN", 401);
  }

  const authProvider = provider as TarotAuthProvider;
  const resolvedName = body.displayName ?? displayNameFromProvider ?? null;

  // 기존 계정 여부 확인
  const isNew = !(await prisma.user.findUnique({
    where: { authProvider_authProviderId: { authProvider, authProviderId: sub! } },
    select: { id: true },
  }));

  const user = await prisma.user.upsert({
    where: { authProvider_authProviderId: { authProvider, authProviderId: sub! } },
    create: {
      authProvider,
      authProviderId: sub!,
      email: email ?? null,
      displayName: resolvedName,
      membershipStatus: "FREE",
    },
    update: {
      ...(email !== undefined ? { email } : {}),
      ...(resolvedName !== null ? { displayName: resolvedName } : {}),
    },
    select: { id: true, displayName: true, membershipStatus: true },
  });

  // 신규 가입 시 크레딧 보너스
  if (isNew) {
    await grantSignupBonus(user.id);
  }

  const streak = await processLoginStreak(user.id);
  const credits = await getCreditBalance(user.id);
  const token = issueToken(user.id);

  const resBody = NextResponse.json({
    token, // 모바일 앱용: SecureStore에 저장
    user: {
      id: user.id,
      displayName: user.displayName,
      membershipStatus: user.membershipStatus,
      credits,
      isNew,
      streakCount: streak.streakCount,
      streakRewardGiven: streak.rewardGiven,
    },
  });

  // 웹 클라이언트 감지 시 HttpOnly 쿠키도 세팅
  const clientType = req.headers.get("x-client-type");
  if (clientType === "web") {
    resBody.headers.set("Set-Cookie", `${AUTH_COOKIE_NAME}=${token}; ${cookieOptions(ACCESS_EXPIRY_MS)}`);
  }

  return resBody;
}
