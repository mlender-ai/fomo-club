/**
 * FOMO Index 산출 파이프라인 — 폴백·데이터 정합성 회귀 테스트.
 * 이슈 #413 (QA): 결측 데이터 폴백, 파이프라인 격리, buildSummary 정합성.
 */
import { describe, it, expect } from "vitest";
import {
  computeFomoIndex,
  marketHeat,
  communityHeat,
  emotionHeat,
  whaleHeat,
  buildSummary,
} from "../src/index";

// ─────────────────────────────────────────────────────────────────────────────
// 데이터 소스별 폴백 (Given: 소스 실패 / When: 산출 / Then: 중립 폴백)
// ─────────────────────────────────────────────────────────────────────────────

describe("Market Heat — 결측 데이터 폴백", () => {
  it("인수 미제공 시 중립 15 반환", () => {
    expect(marketHeat().score).toBe(15);
    expect(marketHeat().meta?.confidence).toBe("fallback");
  });

  it("빈 객체 시 중립 15 반환", () => {
    expect(marketHeat({}).score).toBe(15);
  });

  it("일부 소스만 있어도 NaN 없이 정상 산출", () => {
    const h = marketHeat({ volumeChangePct: 50 });
    expect(Number.isNaN(h.score)).toBe(false);
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(30);
  });
});

describe("Community Heat — 결측 데이터 폴백", () => {
  it("인수 미제공 시 중립 15 반환", () => {
    expect(communityHeat().score).toBe(15);
    expect(communityHeat().meta?.confidence).toBe("fallback");
  });

  it("Reddit 빈 배열 + 다른 소스 없음 → 중립", () => {
    expect(communityHeat({ reddit: [] }).score).toBe(15);
  });
});

describe("Emotion Heat — 결측 데이터 폴백", () => {
  it("투표 0건 → 중립 15, fallback confidence", () => {
    const h = emotionHeat({});
    expect(h.score).toBe(15);
    expect(h.meta?.confidence).toBe("fallback");
  });

  it("투표 1건 → NaN 없이 정상 산출", () => {
    const h = emotionHeat({ fomo: 1 });
    expect(Number.isNaN(h.score)).toBe(false);
  });
});

describe("Whale Heat — 결측 데이터 폴백", () => {
  it("이벤트 없으면 0 반환, fallback confidence", () => {
    expect(whaleHeat().score).toBe(0);
    expect(whaleHeat().meta?.confidence).toBe("fallback");
  });

  it("유효하지 않은 weight(음수/NaN) 무시", () => {
    const h = whaleHeat([{ weight: -5 }, { weight: NaN }]);
    expect(h.score).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeFomoIndex — 전체 파이프라인 폴백 시나리오
// ─────────────────────────────────────────────────────────────────────────────

describe("computeFomoIndex — 결측/부분 데이터 시나리오", () => {
  it("Given: 모든 소스 미비 / When: 산출 / Then: 중립 스냅샷 반환", () => {
    const idx = computeFomoIndex({}, "2026-06-11");
    expect(idx.score).toBe(45); // 15+15+15+0
    expect(idx.state).toBe("관심");
    expect(idx.components).toHaveLength(4);
    // 정직한 숫자: 모든 Heat이 fallback
    for (const c of idx.components) {
      expect(c.meta?.confidence).toBe("fallback");
    }
  });

  it("Given: emotion만 있음 / When: 산출 / Then: 나머지 Heat는 중립 폴백", () => {
    const idx = computeFomoIndex({ emotion: { fomo: 10, greed: 5 } }, "2026-06-11");
    const emotionComp = idx.components.find((c) => c.key === "emotion")!;
    const marketComp = idx.components.find((c) => c.key === "market")!;
    // emotion은 실제 데이터 반영
    expect(emotionComp.score).toBeGreaterThan(15);
    // market은 폴백
    expect(marketComp.meta?.confidence).toBe("fallback");
    expect(marketComp.score).toBe(15);
  });

  it("Given: 데이터 소스 일부 실패 / Then: 오류 전파 없이 정상 반환", () => {
    // 유효하지 않은 감정 데이터 타입도 안전하게 처리
    expect(() => computeFomoIndex({ emotion: {} }, "2026-06-11")).not.toThrow();
  });

  it("score는 항상 0~100 범위", () => {
    const max = computeFomoIndex(
      {
        market: { volumeChangePct: 9999, turnoverChangePct: 9999 },
        emotion: { fomo: 1000, greed: 1000 },
        whale: [{ weight: 9999 }],
      },
      "2026-06-11"
    );
    expect(max.score).toBeLessThanOrEqual(100);

    const min = computeFomoIndex(
      {
        market: { volumeChangePct: -9999 },
        emotion: { fear: 1000, regret: 1000 },
      },
      "2026-06-11"
    );
    expect(min.score).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSummary — Heat 정보 포함 + 투자 조언 금지
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary — Heat 정보 + 정직한 숫자 (#428)", () => {
  it("투표 없을 때도 상위 2개 Heat 비율 포함된 문장 반환", () => {
    const idx = computeFomoIndex({}, "2026-06-11");
    const s = buildSummary(idx, {});
    expect(s).toContain("%");
    expect(s.length).toBeGreaterThan(10);
  });

  it("최다 감정 언급 + Heat 정보 모두 포함", () => {
    const idx = computeFomoIndex({ emotion: { fear: 8, fomo: 2 } }, "2026-06-11");
    const s = buildSummary(idx, { fear: 8, fomo: 2 });
    expect(s).toContain("공포");
    expect(s).toContain("%");
  });

  it("투자 조언·단정 표현 없음", () => {
    const idx = computeFomoIndex({}, "2026-06-11");
    const s = buildSummary(idx, {});
    expect(s).not.toMatch(/매수|매도|반드시|보장|폭락|급등/);
  });
});
