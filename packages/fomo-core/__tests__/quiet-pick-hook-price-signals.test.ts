import { describe, it, expect } from "vitest";
import {
  buildQuietPickHook,
  buildQuietPickChips,
  type QuietPickAnomalyFacts,
} from "../src/keyword-cards/quiet-pick-hook";

const base: Omit<QuietPickAnomalyFacts, "kind"> = { actorNoun: "", scale: "4일 연속", days: 4 };

describe("WO-RESET-03 두 형은 제 문장을 갖는다 — 주체가 없는 신호다", () => {
  it("시장 역행은 「매수 중」이라고 말하지 않는다 — 아무도 사고 있지 않다", () => {
    const hook = buildQuietPickHook({ ...base, kind: "market_divergence", indexChangePct: -2.3, indexLabel: "코스피" });
    expect(hook).not.toContain("매수");
    expect(hook).not.toMatch(/^가 /); // 주체가 비어 `가 조용히…` 로 시작하던 실측 버그
    expect(hook).toContain("코스피");
    expect(hook).toContain("2.3");
  });

  it("지수 변동을 못 재면 숫자를 지어내지 않는다", () => {
    const hook = buildQuietPickHook({ ...base, kind: "market_divergence" });
    expect(hook).toBe("시장이 빠진 4일 내내 혼자 버팀");
  });

  it("거래량 각성은 배수와 실제 주가 변동을 말한다", () => {
    const hook = buildQuietPickHook({
      ...base, kind: "volume_awakening", scale: "3배", days: 0, volumeMultiple: 3.4, spikeMovePct: -1.2,
    });
    expect(hook).toContain("3배");
    expect(hook).toContain("1.2");
    expect(hook).not.toContain("매수");
  });

  it("주가 변동을 못 재면 「그대로」라고 단정하지 않는다", () => {
    const hook = buildQuietPickHook({ ...base, kind: "volume_awakening", scale: "3배", days: 0, volumeMultiple: 3 });
    expect(hook).toBe("거래량 3배, 주가는 아직");
  });
});

describe("칩도 형에 맞아야 한다", () => {
  it("거래량 각성 카드에 「거래량 평소의 N%」(=말라 있다)가 붙지 않는다 — 훅과 정면 모순", () => {
    const chips = buildQuietPickChips({
      ...base, kind: "volume_awakening", scale: "3배", days: 0,
      volumeMultiple: 3.4, spikeMovePct: -1.2, volumeVacuumRatio: 0.39,
    });
    expect(chips.join(" ")).not.toContain("평소의");
    expect(chips.join(" ")).not.toContain("거래량은 그대로");
    expect(chips.some((c) => c.includes("3배"))).toBe(true);
  });

  it("칩 앞에 공백이 남지 않는다 — 주체가 빈 형에서 ` 3배` 로 나가던 실측 버그", () => {
    for (const kind of ["market_divergence", "volume_awakening"] as const) {
      for (const chip of buildQuietPickChips({ ...base, kind })) {
        expect(chip).toBe(chip.trim());
        expect(chip).not.toBe("");
      }
    }
  });

  it("시장 역행 칩은 지수와 견준 사실만 쓴다", () => {
    const chips = buildQuietPickChips({ ...base, kind: "market_divergence", indexChangePct: -2.3, indexLabel: "코스피" });
    expect(chips.some((c) => c.includes("코스피"))).toBe(true);
    expect(chips.join(" ")).not.toContain("매수");
  });
});
