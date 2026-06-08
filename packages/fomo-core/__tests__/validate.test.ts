/**
 * FOMO Index 입력 검증 유틸리티 테스트 — #396, #397
 *
 * 외부 데이터 소스 조작·오류값이 파이프라인에 유입되는 경우
 * 안전하게 클램핑되고 이상치가 기록되는지 검증한다.
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeMarketSignals,
  sanitizeCommunitySignals,
  detectSpikeAnomaly,
} from "../src/index-engine/validate";

describe("sanitizeMarketSignals — 범위 검증 및 클램핑", () => {
  it("정상 범위 입력은 그대로 통과", () => {
    const result = sanitizeMarketSignals({ volumeChangePct: 50, turnoverChangePct: -30 });
    expect(result.anomalies).toHaveLength(0);
    expect(result.data.volumeChangePct).toBe(50);
    expect(result.data.turnoverChangePct).toBe(-30);
  });

  it("상한 초과 값은 500으로 클램핑되고 anomaly 기록", () => {
    const result = sanitizeMarketSignals({ volumeChangePct: 99999 });
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toContain("volumeChangePct");
    expect(result.data.volumeChangePct).toBe(500);
  });

  it("하한 미만 값(-200%)은 -100으로 클램핑", () => {
    const result = sanitizeMarketSignals({ searchChangePct: -200 });
    expect(result.anomalies).toHaveLength(1);
    expect(result.data.searchChangePct).toBe(-100);
  });

  it("undefined는 data에 포함되지 않음 (anomaly 없음)", () => {
    const result = sanitizeMarketSignals({ volumeChangePct: undefined });
    expect(result.anomalies).toHaveLength(0);
    expect("volumeChangePct" in result.data).toBe(false);
  });

  it("NaN은 data에 포함되지 않음 (anomaly 없음)", () => {
    const result = sanitizeMarketSignals({ etfInflowPct: NaN });
    expect(result.anomalies).toHaveLength(0);
    expect("etfInflowPct" in result.data).toBe(false);
  });

  it("여러 필드 동시 검증", () => {
    const result = sanitizeMarketSignals({
      volumeChangePct: 1000,
      turnoverChangePct: -500,
      searchChangePct: 30,
    });
    expect(result.anomalies).toHaveLength(2);
    expect(result.data.volumeChangePct).toBe(500);
    expect(result.data.turnoverChangePct).toBe(-100);
    expect(result.data.searchChangePct).toBe(30); // 정상값
  });
});

describe("sanitizeCommunitySignals — Reddit + bullishRatio 검증", () => {
  it("정상 신호는 그대로 통과", () => {
    const result = sanitizeCommunitySignals({
      mentionChangePct: 20,
      bullishRatio: 0.6,
    });
    expect(result.anomalies).toHaveLength(0);
    expect(result.data.bullishRatio).toBe(0.6);
  });

  it("bullishRatio > 1 은 1로 클램핑", () => {
    const result = sanitizeCommunitySignals({ bullishRatio: 1.5 });
    expect(result.anomalies).toHaveLength(1);
    expect(result.data.bullishRatio).toBe(1);
  });

  it("bullishRatio < 0 은 0으로 클램핑", () => {
    const result = sanitizeCommunitySignals({ bullishRatio: -0.3 });
    expect(result.anomalies).toHaveLength(1);
    expect(result.data.bullishRatio).toBe(0);
  });

  it("Reddit 신호 중 유효하지 않은 항목 제거", () => {
    const result = sanitizeCommunitySignals({
      reddit: [
        {
          subreddit: "wallstreetbets",
          postCount: 10,
          totalUpvotes: 500,
          totalComments: 100,
          bullishRatio: 0.7,
          fetchedAt: "2026-06-08T00:00:00Z",
        },
        // 유효하지 않은 항목: bullishRatio > 1
        {
          subreddit: "baddata",
          postCount: -1,
          totalUpvotes: -100,
          totalComments: 0,
          bullishRatio: 2.0,
          fetchedAt: "2026-06-08T00:00:00Z",
        },
      ],
    });
    expect(result.data.reddit).toHaveLength(1);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toContain("Reddit");
  });

  it("Reddit 빈 배열은 anomaly 없이 통과", () => {
    const result = sanitizeCommunitySignals({ reddit: [] });
    expect(result.anomalies).toHaveLength(0);
  });

  it("subreddit 빈 문자열 항목 제거", () => {
    const result = sanitizeCommunitySignals({
      reddit: [
        {
          subreddit: "",
          postCount: 5,
          totalUpvotes: 100,
          totalComments: 20,
          bullishRatio: 0.5,
          fetchedAt: "2026-06-08T00:00:00Z",
        },
      ],
    });
    expect(result.data.reddit).toHaveLength(0);
    expect(result.anomalies).toHaveLength(1);
  });
});

describe("detectSpikeAnomaly — 이상치 급변 탐지", () => {
  it("3배 이상 변화 시 true", () => {
    expect(detectSpikeAnomaly(100, 10)).toBe(true);  // 10x 변화
    expect(detectSpikeAnomaly(40, 10)).toBe(true);   // 4x 변화 (threshold=3)
  });

  it("3배 미만 변화 시 false", () => {
    expect(detectSpikeAnomaly(25, 10)).toBe(false);  // 2.5x
    expect(detectSpikeAnomaly(12, 10)).toBe(false);  // 1.2x
  });

  it("previous=0이고 current>30이면 이상치", () => {
    expect(detectSpikeAnomaly(50, 0)).toBe(true);
    expect(detectSpikeAnomaly(20, 0)).toBe(false);
  });

  it("threshold 커스텀 지정", () => {
    expect(detectSpikeAnomaly(15, 10, 2)).toBe(false);  // 1.5x < threshold=2
    expect(detectSpikeAnomaly(25, 10, 2)).toBe(true);   // 2.5x > threshold=2
  });

  it("감소도 이상치로 탐지", () => {
    expect(detectSpikeAnomaly(1, 100)).toBe(true);  // 99% 감소
  });
});
