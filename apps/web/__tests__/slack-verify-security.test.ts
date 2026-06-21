import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySlackRequest } from "../lib/slack/verify";

const SECRET = "test-slack-signing-secret-at-least-32-bytes";

function sign(timestamp: string, body: string): string {
  return `v0=${createHmac("sha256", SECRET).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

beforeEach(() => {
  vi.stubEnv("SLACK_SIGNING_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Slack request verification", () => {
  it("accepts a correctly signed current request", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = "command=%2Ffomo&text=status";

    expect(verifySlackRequest(timestamp, body, sign(timestamp, body))).toBe(true);
  });

  it("fails closed without throwing for malformed signatures", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));

    expect(() => verifySlackRequest(timestamp, "body", "v0=short")).not.toThrow();
    expect(verifySlackRequest(timestamp, "body", "v0=short")).toBe(false);
    expect(verifySlackRequest(timestamp, "body", "not-a-signature")).toBe(false);
  });

  it("rejects stale, future, and non-numeric timestamps", () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = String(now - 301);
    const future = String(now + 301);

    expect(verifySlackRequest(stale, "body", sign(stale, "body"))).toBe(false);
    expect(verifySlackRequest(future, "body", sign(future, "body"))).toBe(false);
    expect(verifySlackRequest("NaN", "body", "v0=" + "0".repeat(64))).toBe(false);
  });
});
