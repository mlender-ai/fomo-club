import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "admin_token";
const ALGORITHM = "HS256";

// Edge Runtime에서 직접 JWT 검증 (jose는 Web Crypto API 기반으로 Edge 호환)
async function isValidAdminToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret || secret.length < 32) return false;

    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: [ALGORITHM] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 자산 및 Next.js 내부 경로는 통과
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/tarot") // 모바일 앱 API는 별도 인증 사용
  ) {
    return NextResponse.next();
  }

  // 어드민 로그인 페이지 및 로그인 API는 인증 없이 통과
  if (
    pathname === "/admin/login" ||
    pathname === "/api/admin/auth/login"
  ) {
    return NextResponse.next();
  }

  // /admin/** 경로: JWT 검증
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token || !(await isValidAdminToken(token))) {
      // API 요청은 JSON 401, 페이지 요청은 로그인으로 리다이렉트
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json(
          { error: "Unauthorized", code: "NO_SESSION" },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    // 인증 성공 — 보안 헤더 추가
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // 기존 /login 페이지 → /admin/login으로 리다이렉트
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/login",
  ],
};
