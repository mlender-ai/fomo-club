// 서버 사이드 JWT — 경량 구현 (Node crypto 내장 모듈만 사용)
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env["TAROT_API_SECRET"] ?? "dev-secret-change-me";
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30일

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
  const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verify(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];

  const expectedSig = createHmac("sha256", SECRET)
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
  return sign({ userId, iat: now, exp: now + EXPIRY_MS });
}

export function verifyToken(token: string): string | null {
  const payload = verify(token);
  return payload?.userId ?? null;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
