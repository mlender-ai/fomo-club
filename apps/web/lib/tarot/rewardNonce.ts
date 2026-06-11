import * as crypto from "crypto";
import { resolveServerSecret } from "./secret";

// P0-1: 하드코딩 폴백 제거 → fail-closed (prod 미설정 시 throw, dev/test 프로세스별 랜덤).
const nonceSecret = (): string => resolveServerSecret("REWARD_NONCE_SECRET", "JWT_SECRET");

export const NONCE_TTL_MS = 10 * 60 * 1000; // 10분

export function issueNonce(userId: string): {
  nonce: string;
  token: string;
  expiresAt: number;
} {
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const token = signNonce(nonce, userId, expiresAt);
  return { nonce, token, expiresAt };
}

export function signNonce(
  nonce: string,
  userId: string,
  expiresAt: number
): string {
  return crypto
    .createHmac("sha256", nonceSecret())
    .update(`${nonce}:${userId}:${expiresAt}`)
    .digest("hex");
}

export function verifyNonce(
  nonce: string,
  userId: string,
  token: string,
  expiresAt: number
): boolean {
  if (Date.now() > expiresAt) return false;
  const expected = signNonce(nonce, userId, expiresAt);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(token, "hex")
    );
  } catch {
    return false;
  }
}
