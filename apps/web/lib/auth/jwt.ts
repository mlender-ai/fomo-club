// 서버 사이드 JWT — 경량 구현 (Node crypto 내장 모듈만 사용)
// 공유 인증 인프라 — 보관된 감정 투표/캘린더(/api/fomo/emotions/*)가 Bearer 검증에 재사용.
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { resolveServerSecret } from "./secret";

// fail-closed. 호출 시점에 해석(빌드 무중단, prod 미설정 시 throw).
// 전용 키 우선, 미설정 시 prod의 기존 JWT_SECRET 재사용.
const secret = (): string => resolveServerSecret("FOMO_API_SECRET", "JWT_SECRET");
export const ACCESS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const REFRESH_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90일 리프레시 토큰

interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: JwtPayload): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verify(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];

  const expectedSig = createHmac("sha256", secret())
    .update(`${header}.${body}`)
    .digest("base64url");

  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expectedSig, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as JwtPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueToken(userId: string): string {
  const now = Date.now();
  return sign({ userId, iat: now, exp: now + ACCESS_EXPIRY_MS });
}

export function generateRefreshToken(): string {
  return randomBytes(40).toString("base64url");
}

export function getRefreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_EXPIRY_MS);
}

export function verifyToken(token: string): string | null {
  const payload = verify(token);
  return payload?.userId ?? null;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

// 쿠키 속성 — 웹 클라이언트용 HttpOnly 설정
export const AUTH_COOKIE_NAME = "fomo_access_token";
export const REFRESH_COOKIE_NAME = "fomo_refresh_token";
export function cookieOptions(maxAgeMs: number): string {
  const prod = process.env["NODE_ENV"] === "production";
  const maxAge = Math.floor(maxAgeMs / 1000);
  return [`Max-Age=${maxAge}`, "Path=/", "HttpOnly", "SameSite=Strict", prod ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
}
