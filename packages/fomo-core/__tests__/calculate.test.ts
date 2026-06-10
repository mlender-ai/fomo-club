/**
 * computeFomoIndex 회귀 테스트 — 폴백 처리 및 데이터 정합성 검증.
 * QA 이슈 #413: 데이터 소스 실패 시 안전한 폴백 + 스냅샷 정합성 보장.
 */
import { describe, it, expect, vi } from "vitest";
import { computeFomoIndex } from "../src/index-engine/calculate";
import * as marketHeatModule from "../src/index-engine/marketHeat";
import * as communityHeatModule from "../src/index-engine/communityHeat";
import * as emotionHeatModule from "../src/index-engine/emotionHeat";
import * as whaleHeatModule from "../src/index-engine/whaleHeat";

// ─── 1. 기본 폴백 동작 ───────────────────────────────────────────────────────

describe("데이터 소스가 정상일 때", () => {
  it("모든 Heat를 합산하여 정확히 1건의 스냅샷을 반환한다", () => {
    // Given: 모든 데이터 소스가 정상적으로 작동
    // When: computeFomoIndex를 호출
    const idx = computeFomoIndex(
      {
        market: { volumeChangePct: 50, turnoverChangePct: 40 },
        community: { mentionChangePct: 30, bullishRatio: 0.6 },
        emotion: { fomo: 5, greed: 3, fear: 2 },
        whale: [{ weight: 3, label: "BTC 신고가" }],
      },
      "2026-06-10"
    );

    // Then: 정확히 4개 컴포넌트, 날짜 일치, score 범위 0~100
    expect(idx.components).toHaveLength(4);
    expect(idx.date).toBe("2026-06-10");
    expect(idx.score).toBeGreaterThanOrEqual(0);
    expect(idx.score).toBeLessThanOrEqual(100);
    expect(idx.score).toBe(
      idx.components.reduce((sum, c) => sum + c.score, 0)
    );
  });

  it("components의 score 합이 최종 score와 일치한다", () => {
    const idx = computeFomoIndex(
      { emotion: { fomo: 10, greed: 5 }, whale: [{ weight: 4 }] },
      "2026-06-10"
    );
    const sumFromComponents = idx.components.reduce((sum, c) => sum + c.score, 0);
    expect(idx.score).toBe(sumFromComponents);
  });
});

// ─── 2. 데이터 소스 실패 시 폴백 ─────────────────────────────────────────────

describe("데이터 소스 일부 실패 시", () => {
  it("누락된 데이터는 폴백 값으로 대체되어 FOMO Index를 정상 반환한다", () => {
    // Given: 데이터 소스 일부가 실패(undefined)
    // When: 일부 inputs만 전달
    const idx = computeFomoIndex(
      { emotion: { fear: 8, regret: 2 } },
      "2026-06-10"
    );

    // Then: 누락된 Market/Community/Whale은 폴백 처리, score는 정상
    expect(idx.score).toBeGreaterThanOrEqual(0);
    expect(idx.score).toBeLessThanOrEqual(100);
    expect(idx.components.find((c) => c.key === "market")?.meta?.confidence).toBe("fallback");
    expect(idx.components.find((c) => c.key === "community")?.meta?.confidence).toBe("fallback");
  });

  it("전체 데이터 미비 시 중립 스냅샷(45점, 관심)을 반환한다", () => {
    const idx = computeFomoIndex({}, "2026-06-10");
    // Market(15) + Community(15) + Emotion(15) + Whale(0) = 45
    expect(idx.score).toBe(45);
    expect(idx.state).toBe("관심");
  });

  it("MarketHeat가 예외를 던져도 파이프라인이 중단되지 않는다", () => {
    // Given: marketHeat 함수가 예외를 던지는 상황
    const spy = vi.spyOn(marketHeatModule, "marketHeat").mockImplementationOnce(() => {
      throw new Error("Market API 연결 실패");
    });

    // When: computeFomoIndex 호출
    const idx = computeFomoIndex({ market: { volumeChangePct: 10 } }, "2026-06-10");

    // Then: 오류 노출 없이 폴백 값(15)으로 대체
    expect(idx.score).toBeGreaterThanOrEqual(0);
    expect(idx.components.find((c) => c.key === "market")?.score).toBe(15);
    spy.mockRestore();
  });

  it("CommunityHeat가 예외를 던져도 폴백 처리된다", () => {
    const spy = vi.spyOn(communityHeatModule, "communityHeat").mockImplementationOnce(() => {
      throw new Error("Reddit API 타임아웃");
    });

    const idx = computeFomoIndex({ community: { mentionChangePct: 20 } }, "2026-06-10");

    expect(idx.score).toBeGreaterThanOrEqual(0);
    expect(idx.components.find((c) => c.key === "community")?.score).toBe(15);
    spy.mockRestore();
  });

  it("EmotionHeat가 예외를 던져도 폴백 처리된다", () => {
    const spy = vi.spyOn(emotionHeatModule, "emotionHeat").mockImplementationOnce(() => {
      throw new Error("DB 연결 오류");
    });

    const idx = computeFomoIndex({ emotion: { fomo: 5 } }, "2026-06-10");

    expect(idx.score).toBeGreaterThanOrEqual(0);
    expect(idx.components.find((c) => c.key === "emotion")?.score).toBe(15);
    spy.mockRestore();
  });

  it("WhaleHeat가 예외를 던져도 폴백 처리된다", () => {
    const spy = vi.spyOn(whaleHeatModule, "whaleHeat").mockImplementationOnce(() => {
      throw new Error("CoinGecko API 오류");
    });

    const idx = computeFomoIndex({ whale: [{ weight: 5 }] }, "2026-06-10");

    expect(idx.score).toBeGreaterThanOrEqual(0);
    expect(idx.components.find((c) => c.key === "whale")?.score).toBe(0);
    spy.mockRestore();
  });
});

// ─── 3. 데이터 정합성 검증 ───────────────────────────────────────────────────

describe("스냅샷 데이터 정합성", () => {
  it("score는 항상 0~100 범위를 벗어나지 않는다", () => {
    const extremeCases = [
      computeFomoIndex({}, "2026-06-10"),
      computeFomoIndex(
        {
          market: { volumeChangePct: 999, turnoverChangePct: 999 },
          emotion: { fomo: 100, greed: 100 },
          whale: [{ weight: 999 }],
        },
        "2026-06-10"
      ),
      computeFomoIndex(
        {
          market: { volumeChangePct: -999 },
          emotion: { fear: 100, regret: 100 },
        },
        "2026-06-10"
      ),
    ];

    for (const idx of extremeCases) {
      expect(idx.score).toBeGreaterThanOrEqual(0);
      expect(idx.score).toBeLessThanOrEqual(100);
    }
  });

  it("state는 항상 유효한 FomoState 중 하나이다", () => {
    const VALID_STATES = ["무관심", "관망", "관심", "FOMO", "광기"];
    const idx = computeFomoIndex({ emotion: { fomo: 20 } }, "2026-06-10");
    expect(VALID_STATES).toContain(idx.state);
  });

  it("사용자에게 오류 데이터(undefined/null score)는 노출되지 않는다", () => {
    const idx = computeFomoIndex({}, "2026-06-10");
    expect(idx.score).not.toBeNaN();
    expect(idx.score).not.toBeUndefined();
    expect(idx.score).not.toBeNull();
    for (const c of idx.components) {
      expect(c.score).not.toBeNaN();
    }
  });
});
