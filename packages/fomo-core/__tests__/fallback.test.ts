import { describe, it, expect } from "vitest";
import { getFallbackComponents, isValidHeatComponent, sanitizeComponents } from "../src/index-engine/fallback";

describe("getFallbackComponents — 안전한 기본값 반환", () => {
  it("4개 컴포넌트를 반환한다", () => {
    const comps = getFallbackComponents();
    expect(comps).toHaveLength(4);
  });

  it("key 순서: market, community, emotion, whale", () => {
    const keys = getFallbackComponents().map((c) => c.key);
    expect(keys).toEqual(["market", "community", "emotion", "whale"]);
  });

  it("market/community/emotion 폴백값은 각 max의 50% (중립)", () => {
    const [market, community, emotion, whale] = getFallbackComponents();
    expect(market!.score).toBe(15);    // 30 / 2
    expect(community!.score).toBe(15); // 30 / 2
    expect(emotion!.score).toBe(15);   // 30 / 2
    expect(whale!.score).toBe(0);      // 이벤트 없음이 기본
  });

  it("합산 점수는 45 (중립 FOMO Index)", () => {
    const total = getFallbackComponents().reduce((acc, c) => acc + c.score, 0);
    expect(total).toBe(45);
  });
});

describe("isValidHeatComponent — 유효성 검사", () => {
  it("정상 범위 내 값은 유효", () => {
    expect(isValidHeatComponent({ key: "market", score: 15, max: 30 })).toBe(true);
    expect(isValidHeatComponent({ key: "whale", score: 0, max: 10 })).toBe(true);
    expect(isValidHeatComponent({ key: "emotion", score: 30, max: 30 })).toBe(true);
  });

  it("음수 score는 무효", () => {
    expect(isValidHeatComponent({ key: "market", score: -1, max: 30 })).toBe(false);
  });

  it("max 초과 score는 무효", () => {
    expect(isValidHeatComponent({ key: "market", score: 31, max: 30 })).toBe(false);
  });

  it("NaN score는 무효", () => {
    expect(isValidHeatComponent({ key: "market", score: NaN, max: 30 })).toBe(false);
  });
});

describe("sanitizeComponents — 오염된 Heat 복구", () => {
  it("모두 유효하면 그대로 반환", () => {
    const valid = getFallbackComponents();
    expect(sanitizeComponents(valid)).toEqual(valid);
  });

  it("음수 score가 있는 컴포넌트는 폴백값으로 교체", () => {
    const broken = [
      { key: "market" as const,    score: -5, max: 30 },
      { key: "community" as const, score: 15, max: 30 },
      { key: "emotion" as const,   score: 15, max: 30 },
      { key: "whale" as const,     score: 0,  max: 10 },
    ];
    const result = sanitizeComponents(broken);
    expect(result[0]!.score).toBe(15); // 폴백값
    expect(result[1]!.score).toBe(15); // 변경 없음
  });

  it("NaN score가 있는 컴포넌트는 폴백값으로 교체", () => {
    const broken = [
      { key: "market" as const,    score: NaN, max: 30 },
      { key: "community" as const, score: 20,  max: 30 },
      { key: "emotion" as const,   score: 10,  max: 30 },
      { key: "whale" as const,     score: 5,   max: 10 },
    ];
    const result = sanitizeComponents(broken);
    expect(result[0]!.score).toBe(15);
    expect(result[1]!.score).toBe(20); // 변경 없음
  });
});
