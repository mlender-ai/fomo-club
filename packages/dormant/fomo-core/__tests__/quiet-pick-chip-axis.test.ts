import { describe, expect, it } from "vitest";
import {
  buildQuietPickChips,
  computeQuietPickAnomalies,
  type QuietPickAnomalyFacts,
} from "../src/keyword-cards/quiet-pick-hook";

/**
 * CTX-05 §5 회귀 고정 — **칩 3개는 서로 다른 축이어야 한다.**
 * 2026-08-16 발행 실측에서 빅텍 카드가 "거래량 평소의 30%" 와 "거래량은 그대로" 를 함께 실었다.
 */

/** 빅텍(2026-08-15 발행분) 실측값. */
function bigtec(over: Partial<QuietPickAnomalyFacts> = {}): QuietPickAnomalyFacts {
  return {
    kind: "institution_streak",
    actorNoun: "기관",
    scale: "77주",
    days: 26,
    isLongestStreak: true,
    streakWindowDays: 40,
    volumeVacuumRatio: 0.3,
    volumeElevated: false,
    ...over,
  };
}

describe("칩 축 중복 (CTX-05 §5)", () => {
  it("**거래량 칩이 두 개 실리지 않는다**", () => {
    const chips = buildQuietPickChips(bigtec());
    const volumeChips = chips.filter((c) => c.includes("거래량"));
    expect(volumeChips.length).toBeLessThanOrEqual(1);
    // 강도가 높은 진공 쪽이 남는다.
    expect(chips).not.toContain("거래량은 그대로");
  });

  it("칩이 전부 서로 다르다", () => {
    const chips = buildQuietPickChips(bigtec());
    expect(new Set(chips).size).toBe(chips.length);
  });

  it("거래량 진공은 quiet 축이다 — position 을 점유하지 않는다", () => {
    const vacuum = computeQuietPickAnomalies(bigtec()).find((a) => a.kind === "vacuum");
    expect(vacuum?.axis).toBe("quiet");
  });

  it("**진짜 가격 위치 칩이 밀려나지 않는다**", () => {
    // 저점권 + 거래량 진공이 동시에 있으면 종전에는 진공이 position 을 차지해 near_low 가 사라졌다.
    const anomalies = computeQuietPickAnomalies(bigtec({ pctAboveYearLow: 8 }));
    const nearLow = anomalies.find((a) => a.kind === "near_low");
    expect(nearLow?.axis).toBe("position");

    const chips = buildQuietPickChips(bigtec({ pctAboveYearLow: 8 }));
    expect(chips.some((c) => c.includes("52주 저점"))).toBe(true);
  });

  it("거래량 사실이 하나뿐이면 그것만 실린다", () => {
    const chips = buildQuietPickChips(bigtec({ volumeVacuumRatio: undefined }));
    expect(chips.filter((c) => c.includes("거래량")).length).toBeLessThanOrEqual(1);
  });
});
