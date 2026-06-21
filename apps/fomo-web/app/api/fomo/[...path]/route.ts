import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  isAllowedProxyRequest,
  isTokenUnexpired,
  sanitizeAuthPayload,
} from "../../../../lib/auth-proxy";
import { consumeRateLimit } from "../../../../lib/request-rate-limit";

export const dynamic = "force-dynamic";

const BACKEND_ORIGIN = (
  process.env.FOMO_BACKEND_ORIGIN ??
  process.env.NEXT_PUBLIC_FOMO_API_BASE ??
  "https://fomo-club-backend.vercel.app"
).replace(/\/$/, "");

const AUTH_EXCHANGE_PATHS = new Set(["auth/login", "auth/register"]);
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after"];

function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const proxyPath = path.join("/");

  if (!isAllowedProxyRequest(proxyPath, request.method)) {
    return noStoreJson({ error: "Not found" }, { status: 404 });
  }

  const rateLimit = consumeRateLimit(proxyPath, request.headers.get("x-forwarded-for"));
  if (!rateLimit.allowed) {
    return noStoreJson(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  if (proxyPath === "auth/logout" && request.method === "POST") {
    const response = noStoreJson({ ok: true });
    clearAuthCookie(response);
    return response;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (proxyPath === "auth/session" && request.method === "GET") {
    return noStoreJson({ authenticated: isTokenUnexpired(token) });
  }

  const upstreamUrl = new URL(
    `/api/fomo/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    BACKEND_ORIGIN
  );
  const headers = new Headers({ Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const init: RequestInit = {
      method: request.method,
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }
    const upstream = await fetch(upstreamUrl, init);

    if (AUTH_EXCHANGE_PATHS.has(proxyPath)) {
      const payload = await upstream.json().catch(() => null);
      const sanitized = sanitizeAuthPayload(payload);
      const response = noStoreJson(sanitized.payload, { status: upstream.status });

      if (upstream.ok && sanitized.token) {
        response.cookies.set(AUTH_COOKIE_NAME, sanitized.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
        });
      }
      return response;
    }

    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
    if (upstream.status === 401 || (proxyPath === "account" && request.method === "DELETE" && upstream.ok)) {
      clearAuthCookie(response);
    }
    return response;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return noStoreJson(
      { error: timedOut ? "인증 서버 응답 시간이 초과되었습니다." : "인증 서버에 연결할 수 없습니다." },
      { status: timedOut ? 504 : 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
