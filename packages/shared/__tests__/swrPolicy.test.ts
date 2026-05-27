import { describe, it, expect } from "vitest";
import { decideSwrAction } from "../src/swrPolicy";

const now = Date.parse("2026-05-27T12:00:00.000Z");
const FRESH = 60_000;
const STALE = 5 * 60_000;

describe("decideSwrAction", () => {
  it("캐시 없음 → fetch-blocking", () => {
    expect(decideSwrAction({
      cachedDataAt: null, force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("fetch-blocking");
  });

  it("캐시 있음 + fresh + !force → skip (fetch 전혀 안 함)", () => {
    const dataAt = new Date(now - 30_000).toISOString(); // 30초 전
    expect(decideSwrAction({
      cachedDataAt: dataAt, force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("skip");
  });

  it("캐시 있음 + fresh + force=true → fetch-blocking (사용자 명시적 새로고침)", () => {
    const dataAt = new Date(now - 30_000).toISOString();
    expect(decideSwrAction({
      cachedDataAt: dataAt, force: true, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("fetch-blocking");
  });

  it("캐시 있음 + stale → background-revalidate (즉시 표시 + 백그라운드)", () => {
    const dataAt = new Date(now - 120_000).toISOString(); // 2분 전 (fresh 초과, stale 이내)
    expect(decideSwrAction({
      cachedDataAt: dataAt, force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("background-revalidate");
  });

  it("캐시 있음 + stale + force=true → fetch-blocking (사용자 우선)", () => {
    const dataAt = new Date(now - 120_000).toISOString();
    expect(decideSwrAction({
      cachedDataAt: dataAt, force: true, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("fetch-blocking");
  });

  it("캐시 있음 + expired → fetch-blocking", () => {
    const dataAt = new Date(now - 10 * 60_000).toISOString(); // 10분 전
    expect(decideSwrAction({
      cachedDataAt: dataAt, force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("fetch-blocking");
  });

  it("캐시 있음 + 잘못된 dataAt 형식 → fetch-blocking (안전 폴백)", () => {
    expect(decideSwrAction({
      cachedDataAt: "not-a-date", force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("fetch-blocking");
  });

  it("undefined dataAt → fetch-blocking", () => {
    expect(decideSwrAction({
      cachedDataAt: undefined, force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("fetch-blocking");
  });

  it("fresh 경계값 정확 매치 → skip", () => {
    const dataAt = new Date(now - FRESH).toISOString();
    expect(decideSwrAction({
      cachedDataAt: dataAt, force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("skip");
  });

  it("stale 경계값 정확 매치 → background-revalidate", () => {
    const dataAt = new Date(now - STALE).toISOString();
    expect(decideSwrAction({
      cachedDataAt: dataAt, force: false, now, freshTtlMs: FRESH, staleTtlMs: STALE,
    })).toBe("background-revalidate");
  });
});
