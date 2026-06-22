/**
 * 익명 세션 무결성 검증 (#426).
 * 클라이언트가 세션 ID + HMAC 서명을 함께 전송하면,
 * 서버(BFF proxy)에서 서명을 검증하여 위변조된 요청을 거부한다.
 * HMAC secret 이 없으면 검증을 건너뛴다(개발 환경 호환).
 */

const HMAC_SECRET = process.env.FOMO_SESSION_HMAC_SECRET ?? "";

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signSessionId(sessionId: string): Promise<string> {
  if (!HMAC_SECRET) return "";
  return hmacSign(sessionId, HMAC_SECRET);
}

export async function verifySessionSignature(
  sessionId: string,
  signature: string,
): Promise<boolean> {
  if (!HMAC_SECRET) return true;
  if (!signature) return false;
  const expected = await hmacSign(sessionId, HMAC_SECRET);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: "missing_session" | "missing_signature" | "invalid_signature";
}

export function validateSessionFormat(sessionId: string | undefined): SessionValidationResult {
  if (!sessionId || typeof sessionId !== "string" || sessionId.length === 0) {
    return { valid: false, reason: "missing_session" };
  }
  if (sessionId.length > 128) {
    return { valid: false, reason: "invalid_signature" };
  }
  return { valid: true };
}
