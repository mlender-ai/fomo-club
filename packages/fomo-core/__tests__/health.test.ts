import { describe, it, expect } from "vitest";
import { computeFomoIndex } from "../src/index-engine/calculate";
import { summarizeHealth, renderHealthReport, confidenceRank, heatToLogRecords } from "../src/index-engine/health";

describe("summarizeHealth", () => {
  it("입력 전무 → 4 Heat 모두 폴백, degraded=true", () => {
    const idx = computeFomoIndex({}, "2026-06-08");
    const h = summarizeHealth(idx, 0);
    expect(h.heats).toHaveLength(4);
    expect(h.fallbackCount).toBe(4);
    expect(h.realCount).toBe(0);
    expect(h.degraded).toBe(true);
    expect(h.voteCount).toBe(0);
    expect(h.date).toBe("2026-06-08");
  });

  it("감정 투표 충분 → emotion Heat 실데이터(폴백 아님), 나머지 폴백", () => {
    const idx = computeFomoIndex({ emotion: { fomo: 30, fear: 25 } }, "2026-06-08");
    const h = summarizeHealth(idx, 55);
    const emotion = h.heats.find((x) => x.key === "emotion")!;
    expect(emotion.fallback).toBe(false);
    expect(emotion.confidence).not.toBe("fallback");
    expect(h.realCount).toBeGreaterThanOrEqual(1);
    expect(h.voteCount).toBe(55);
  });

  it("각 heat에 confidence/sources 메타 포함", () => {
    const h = summarizeHealth(computeFomoIndex({}, "2026-06-08"));
    for (const x of h.heats) {
      expect(["high", "medium", "low", "fallback"]).toContain(x.confidence);
      expect(typeof x.sourcesTotal).toBe("number");
    }
  });
});

describe("renderHealthReport", () => {
  it("저하 시 폴백 경고 라인 포함(정직한 표기)", () => {
    const txt = renderHealthReport(summarizeHealth(computeFomoIndex({}, "2026-06-08"), 0));
    expect(txt).toContain("FOMO Index 2026-06-08");
    expect(txt).toContain("폴백");
    expect(txt).toContain("실데이터 0/4");
  });
  it("실데이터 있으면 score/state 표기", () => {
    const txt = renderHealthReport(summarizeHealth(computeFomoIndex({ emotion: { fomo: 60 } }, "2026-06-08"), 60));
    expect(txt).toContain("감정투표 60표");
  });
});

describe("confidenceRank", () => {
  it("fallback < low < medium < high", () => {
    expect(confidenceRank("fallback")).toBeLessThan(confidenceRank("low"));
    expect(confidenceRank("low")).toBeLessThan(confidenceRank("medium"));
    expect(confidenceRank("medium")).toBeLessThan(confidenceRank("high"));
  });
});

describe("heatToLogRecords (#415)", () => {
  it("4개 Heat에 대해 구조화된 로그 레코드 반환", () => {
    const idx = computeFomoIndex({ emotion: { fomo: 10 } }, "2026-06-20");
    const records = heatToLogRecords(idx);
    expect(records).toHaveLength(4);
    for (const r of records) {
      expect(r.date).toBe("2026-06-20");
      expect(typeof r.heat).toBe("string");
      expect(typeof r.score).toBe("number");
      expect(typeof r.fallback).toBe("boolean");
      expect(["high", "medium", "low", "fallback"]).toContain(r.confidence);
    }
  });

  it("폴백 Heat는 fallback=true", () => {
    const idx = computeFomoIndex({}, "2026-06-20");
    const records = heatToLogRecords(idx);
    expect(records.every((r) => r.fallback)).toBe(true);
  });

  it("실데이터 Heat는 fallback=false", () => {
    const idx = computeFomoIndex({ emotion: { fomo: 30, fear: 20 } }, "2026-06-20");
    const emotionRecord = heatToLogRecords(idx).find((r) => r.heat === "emotion")!;
    expect(emotionRecord.fallback).toBe(false);
  });
});
