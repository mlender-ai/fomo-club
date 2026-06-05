import { describe, it, expect } from "vitest";
import {
  marketHeat,
  communityHeat,
  emotionHeat,
  whaleHeat,
  computeFomoIndex,
  buildSummary,
} from "../src/index";

describe("각 Heat — 폴백 (데이터 미비 시 안전한 기본값)", () => {
  it("market/community/emotion은 미비 시 중립 15, whale은 0", () => {
    expect(marketHeat().score).toBe(15);
    expect(communityHeat().score).toBe(15);
    expect(emotionHeat().score).toBe(15);
    expect(whaleHeat().score).toBe(0);
  });

  it("max 경계를 넘지 않는다", () => {
    expect(marketHeat({ volumeChangePct: 999, turnoverChangePct: 999 }).score).toBeLessThanOrEqual(30);
    expect(whaleHeat([{ weight: 50 }]).score).toBe(10);
  });
});

describe("emotionHeat — 감정 방향성", () => {
  it("FOMO/탐욕↑ → 15 초과", () => {
    expect(emotionHeat({ fomo: 8, greed: 2 }).score).toBeGreaterThan(15);
  });
  it("공포/후회↑ → 15 미만", () => {
    expect(emotionHeat({ fear: 7, regret: 3 }).score).toBeLessThan(15);
  });
  it("순수 확신은 중립 근처(분모 희석)", () => {
    expect(emotionHeat({ conviction: 10 }).score).toBe(15);
  });
});

describe("computeFomoIndex — 합산 + 상태", () => {
  it("전 입력 미비 시 중립 스냅샷 (15+15+15+0=45, 관심)", () => {
    const idx = computeFomoIndex({}, "2026-06-05");
    expect(idx.score).toBe(45);
    expect(idx.state).toBe("관심");
    expect(idx.components).toHaveLength(4);
    expect(idx.date).toBe("2026-06-05");
  });

  it("과열 입력 → 광기 구간", () => {
    const idx = computeFomoIndex(
      {
        market: { volumeChangePct: 200, turnoverChangePct: 200, searchChangePct: 200, etfInflowPct: 200 },
        community: { mentionChangePct: 200, bullishRatio: 1 },
        emotion: { fomo: 10, greed: 10 },
        whale: [{ weight: 10 }],
      },
      "2026-06-05"
    );
    expect(idx.score).toBeGreaterThanOrEqual(81);
    expect(idx.state).toBe("광기");
  });
});

describe("buildSummary — 투자 조언/단정 표현 없음", () => {
  it("투표 없을 때도 문장 생성", () => {
    const idx = computeFomoIndex({}, "2026-06-05");
    const s = buildSummary(idx, {});
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toMatch(/매수|매도|반드시|보장|폭락/);
  });
  it("최다 감정을 언급", () => {
    const idx = computeFomoIndex({ emotion: { fear: 5, fomo: 1 } }, "2026-06-05");
    expect(buildSummary(idx, { fear: 5, fomo: 1 })).toContain("공포");
  });
});
