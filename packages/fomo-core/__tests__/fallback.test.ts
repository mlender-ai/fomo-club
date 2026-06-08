/**
 * FOMO Index 폴백 동작 테스트 — #393 PM 이슈
 *
 * 4 Heat 데이터 결측 시 안전한 기본값이 반환되고
 * FOMO Index가 중단 없이 연속적으로 산출됨을 보장한다.
 */
import { describe, it, expect } from "vitest";
import {
  computeFomoIndex,
  marketHeat,
  communityHeat,
  emotionHeat,
  whaleHeat,
} from "../src/index";

describe("FOMO Index 폴백 연속성 (#393)", () => {
  it("4 Heat 모두 결측 시 중립 스냅샷 반환 (15+15+15+0=45)", () => {
    const idx = computeFomoIndex({}, "2026-06-08");
    expect(idx.score).toBe(45);
    expect(idx.state).toBe("관심");
    expect(idx.date).toBe("2026-06-08");
    expect(idx.components).toHaveLength(4);
  });

  it("결측 시에도 null/undefined 없이 안전한 값 반환", () => {
    const idx = computeFomoIndex({}, "2026-06-08");
    for (const c of idx.components) {
      expect(c.score).not.toBeNaN();
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(c.max);
    }
  });

  it("market Heat 결측 → score=15 (NEUTRAL), confidence=fallback", () => {
    const h = marketHeat();
    expect(h.score).toBe(15);
    expect(h.meta?.confidence).toBe("fallback");
    expect(h.meta?.sourcesAvailable).toBe(0);
  });

  it("community Heat 결측 → score=15 (NEUTRAL), confidence=fallback", () => {
    const h = communityHeat();
    expect(h.score).toBe(15);
    expect(h.meta?.confidence).toBe("fallback");
  });

  it("emotion Heat 결측 → score=15 (NEUTRAL), confidence=fallback", () => {
    const h = emotionHeat();
    expect(h.score).toBe(15);
    expect(h.meta?.confidence).toBe("fallback");
  });

  it("whale Heat 결측 → score=0 (보너스형 — 이벤트 없음=0이 올바름), confidence=fallback", () => {
    const h = whaleHeat();
    expect(h.score).toBe(0);
    expect(h.meta?.confidence).toBe("fallback");
  });

  it("일부 Heat만 결측 시에도 정상 합산", () => {
    const idx = computeFomoIndex({ emotion: { fomo: 5, fear: 5 } }, "2026-06-08");
    expect(idx.score).not.toBeNaN();
    expect(idx.state).toBeDefined();
    // emotion이 정확히 중립이면 15, market/community 각각 15, whale 0 → 45
    expect(idx.score).toBe(45);
  });

  it("최악의 조작된 입력도 안전한 범위 반환", () => {
    const idx = computeFomoIndex(
      {
        market: { volumeChangePct: -Infinity, turnoverChangePct: NaN },
        community: { bullishRatio: 99 as unknown as number },
        whale: [{ weight: -100 }],
      },
      "2026-06-08"
    );
    expect(idx.score).toBeGreaterThanOrEqual(0);
    expect(idx.score).toBeLessThanOrEqual(100);
    expect(idx.components).toHaveLength(4);
  });
});

describe("감정 투표 폴백 시나리오 (#396)", () => {
  it("투표 0건 — NEUTRAL 점수 반환, 이상값 없음", () => {
    const h = emotionHeat({});
    expect(h.score).toBe(15);
    expect(h.meta?.confidence).toBe("fallback");
  });

  it("단일 감정에 투표 집중되어도 MAX를 초과하지 않음", () => {
    const h = emotionHeat({ fomo: 1000 });
    expect(h.score).toBeLessThanOrEqual(30);
    expect(h.score).toBeGreaterThan(15);
  });

  it("공포+후회 집중 시 score가 15 미만으로 내려감", () => {
    const h = emotionHeat({ fear: 50, regret: 50 });
    expect(h.score).toBeLessThan(15);
    expect(h.score).toBeGreaterThanOrEqual(0);
  });

  it("모든 감정 균등 분포 → 중립 근처", () => {
    const h = emotionHeat({ fomo: 10, fear: 10, regret: 10, greed: 10, conviction: 10 });
    // fomo+greed=20, fear+regret=20 → net=0 → NEUTRAL
    expect(h.score).toBe(15);
  });
});
