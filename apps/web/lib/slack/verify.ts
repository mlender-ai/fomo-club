import { createHmac, timingSafeEqual } from "crypto";

const MAX_CLOCK_SKEW_SECONDS = 300;
const SIGNATURE_RE = /^v0=[a-f0-9]{64}$/;
const TIMESTAMP_RE = /^\d{10,}$/;

export function verifySlackRequest(
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  // 형식 검사를 먼저 해 timingSafeEqual의 길이 불일치 예외를 외부 입력이 유발하지 못하게 한다.
  if (!SIGNATURE_RE.test(signature) || !TIMESTAMP_RE.test(timestamp)) return false;

  const requestTime = Number(timestamp);
  if (!Number.isSafeInteger(requestTime)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTime) > MAX_CLOCK_SKEW_SECONDS) return false;

  const basestring = `v0:${timestamp}:${body}`;
  const computed = `v0=${createHmac("sha256", signingSecret).update(basestring).digest("hex")}`;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
