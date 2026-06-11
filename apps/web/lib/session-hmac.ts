import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 익명 세션 HMAC 서명 유틸.
 * 이슈 #426: 감정 투표 데이터 위변조 방지 (Phase 1).
 *
 * - SESSION_HMAC_SECRET 미설정 시: 서명 없이 통과 (점진적 도입).
 * - 서명이 제공됐는데 불일치 시: tampered=true → 호출부에서 거부+로깅.
 * - 서명 미제공 시: 기존 클라이언트 호환 유지 (Phase 2에서 필수화).
 */

const HMAC_SECRET = process.env.SESSION_HMAC_SECRET ?? "";

/** UUID v4 또는 클라이언트 폴백 형식(`s_{timestamp}_{random}`) 검사. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FALLBACK_SESSION_RE = /^s_\d+_[a-z0-9]+$/;

export function isValidSessionIdFormat(sessionId: string): boolean {
  return UUID_RE.test(sessionId) || FALLBACK_SESSION_RE.test(sessionId);
}

/** sessionId HMAC-SHA256 서명. SECRET 미설정 시 빈 문자열 반환. */
export function signSession(sessionId: string): string {
  if (!HMAC_SECRET) return "";
  return createHmac("sha256", HMAC_SECRET).update(sessionId).digest("hex");
}

export interface SessionVerifyResult {
  /** 처리를 계속해도 되는지 (포맷 검사 포함). */
  valid: boolean;
  /** 서명이 제공됐는데 불일치 → 위변조 의심. */
  tampered: boolean;
}

/**
 * sessionId + 서명 검증.
 *
 * | 상황                        | valid | tampered |
 * |-----------------------------|-------|----------|
 * | SECRET 미설정               | true  | false    |
 * | 서명 미제공 (기존 클라이언트) | true  | false    |
 * | 서명 일치                   | true  | false    |
 * | 서명 불일치                  | false | true     |
 */
export function verifySession(
  sessionId: string,
  signature?: string
): SessionVerifyResult {
  if (!HMAC_SECRET || !signature) {
    return { valid: true, tampered: false };
  }

  const expected = signSession(sessionId);
  try {
    if (expected.length !== signature.length) {
      return { valid: false, tampered: true };
    }
    const match = timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
    return { valid: match, tampered: !match };
  } catch {
    return { valid: false, tampered: true };
  }
}
