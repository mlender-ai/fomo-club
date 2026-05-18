import { describe, it, expect } from "vitest";
import { buildCacheKey, getCacheTtlMs, isCacheExpired } from "../cache.js";
import type { DrawnCard } from "../types.js";

const makeCard = (id: string, orientation: "upright" | "reversed" = "upright"): DrawnCard => ({
  card: {
    id: id as any,
    name: "Test", nameKo: "테스트", arcana: "major", number: 0,
    keywords: [], keywordsKo: [], meaningUpright: "", meaningReversed: "",
    imageUrl: "", toneGuide: "", isActive: true,
  },
  orientation,
});

describe("buildCacheKey", () => {
  it("ticker, spread, condition, cards로 키 생성", () => {
    const key = buildCacheKey("AAPL", "single", [makeCard("the-fool")], "bullish");
    expect(key).toContain("AAPL");
    expect(key).toContain("single");
    expect(key).toContain("bullish");
    expect(key).toContain("the-fool");
  });

  it("ticker가 다르면 다른 키", () => {
    const cards = [makeCard("the-fool")];
    const key1 = buildCacheKey("AAPL", "single", cards, "neutral");
    const key2 = buildCacheKey("NVDA", "single", cards, "neutral");
    expect(key1).not.toBe(key2);
  });

  it("orientation이 다르면 다른 키", () => {
    const key1 = buildCacheKey("AAPL", "single", [makeCard("the-fool", "upright")], "neutral");
    const key2 = buildCacheKey("AAPL", "single", [makeCard("the-fool", "reversed")], "neutral");
    expect(key1).not.toBe(key2);
  });
});

describe("getCacheTtlMs", () => {
  it("volatile — 30분 (ms)", () => {
    expect(getCacheTtlMs("volatile")).toBe(30 * 60 * 1000);
  });

  it("bullish/bearish — 1시간 (ms)", () => {
    expect(getCacheTtlMs("bullish")).toBe(60 * 60 * 1000);
    expect(getCacheTtlMs("bearish")).toBe(60 * 60 * 1000);
  });

  it("neutral/consolidating — 2시간 (ms)", () => {
    expect(getCacheTtlMs("neutral")).toBe(2 * 60 * 60 * 1000);
    expect(getCacheTtlMs("consolidating")).toBe(2 * 60 * 60 * 1000);
  });
});

describe("isCacheExpired", () => {
  it("TTL 이내 — 만료 아님", () => {
    const recent = new Date(Date.now() - 10_000).toISOString();
    expect(isCacheExpired(recent, "neutral")).toBe(false);
  });

  it("TTL 초과 — 만료됨", () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(isCacheExpired(old, "neutral")).toBe(true);
  });
});
