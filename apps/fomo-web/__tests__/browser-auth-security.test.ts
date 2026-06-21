import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { isAllowedProxyRequest, isTokenUnexpired, sanitizeAuthPayload } from "../lib/auth-proxy";
import { consumeRateLimit, getClientIp, resetRateLimitStore } from "../lib/request-rate-limit";

const testDir = fileURLToPath(new URL(".", import.meta.url));

afterEach(() => {
  resetRateLimitStore();
});

function tokenWithExpiry(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("FOMO Web browser auth security", () => {
  it("removes the backend JWT before returning auth data to browser JavaScript", () => {
    const original = { token: "secret-jwt", user: { id: "user-1" } };
    const result = sanitizeAuthPayload(original);

    expect(result.token).toBe("secret-jwt");
    expect(result.payload).toEqual({ user: { id: "user-1" } });
    expect(original.token).toBe("secret-jwt");
  });

  it("treats malformed and expired cookies as signed out", () => {
    expect(isTokenUnexpired("not-a-token", 1_000)).toBe(false);
    expect(isTokenUnexpired(tokenWithExpiry(999), 1_000)).toBe(false);
    expect(isTokenUnexpired(tokenWithExpiry(1_001), 1_000)).toBe(true);
  });

  it("only proxies explicitly allowed authenticated routes and methods", () => {
    expect(isAllowedProxyRequest("auth/login", "POST")).toBe(true);
    expect(isAllowedProxyRequest("emotions/calendar", "GET")).toBe(true);
    expect(isAllowedProxyRequest("account", "DELETE")).toBe(true);
    expect(isAllowedProxyRequest("auth/login", "GET")).toBe(false);
    expect(isAllowedProxyRequest("../runtime/state", "GET")).toBe(false);
    expect(isAllowedProxyRequest("feed", "GET")).toBe(false);
  });

  it("does not write authentication credentials to localStorage or browser Authorization headers", () => {
    const authSource = readFileSync(resolve(testDir, "../lib/auth.ts"), "utf8");
    const apiSource = readFileSync(resolve(testDir, "../lib/fomoApi.ts"), "utf8");

    expect(authSource).not.toContain("localStorage.setItem");
    expect(apiSource).not.toContain("Authorization");
    expect(apiSource).not.toContain("setToken(");
  });

  it("keeps CSP in report-only mode during the compatibility rollout", () => {
    const config = readFileSync(resolve(testDir, "../next.config.mjs"), "utf8");

    expect(config).toContain('key: "Content-Security-Policy"');
    expect(config).toContain("Content-Security-Policy-Report-Only");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("https://t1.kakaocdn.net");
  });

  it("rate limits repeated auth attempts per client IP", () => {
    const now = 1_000;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = consumeRateLimit("auth/login", "203.0.113.10", now);
      expect(result.allowed).toBe(true);
    }

    const blocked = consumeRateLimit("auth/login", "203.0.113.10", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    const otherIp = consumeRateLimit("auth/login", "203.0.113.11", now);
    expect(otherIp.allowed).toBe(true);
  });

  it("shares session checks by IP but isolates mutations by path", () => {
    const now = 2_000;

    const session = Array.from({ length: 60 }, () => consumeRateLimit("auth/session", "198.51.100.7", now));
    expect(session.every((result) => result.allowed)).toBe(true);
    expect(consumeRateLimit("auth/session", "198.51.100.7", now).allowed).toBe(false);

    const vote = Array.from({ length: 30 }, () => consumeRateLimit("emotions/vote", "198.51.100.7", now));
    expect(vote.every((result) => result.allowed)).toBe(true);
    expect(consumeRateLimit("taste", "198.51.100.7", now).allowed).toBe(true);
  });

  it("normalizes the first forwarded IP and falls back safely", () => {
    expect(getClientIp("198.51.100.7, 10.0.0.1")).toBe("198.51.100.7");
    expect(getClientIp(null)).toBe("unknown");
  });
});
