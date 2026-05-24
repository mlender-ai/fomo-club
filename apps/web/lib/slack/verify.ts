import { createHmac, timingSafeEqual } from "crypto";

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

export function verifySlackRequest(
  timestamp: string,
  body: string,
  signature: string
): boolean {
  if (!SIGNING_SECRET) return false;

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const basestring = `v0:${timestamp}:${body}`;
  const computed = `v0=${createHmac("sha256", SIGNING_SECRET).update(basestring).digest("hex")}`;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
