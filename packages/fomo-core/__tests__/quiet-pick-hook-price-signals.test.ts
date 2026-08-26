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

describe("같은 형이 여러 장 나와도 서로 다른 카드여야 한다", () => {
  it("시장 역행 카드 두 장이 같은 문장을 쓰지 않는다 — 종목마다 등락률이 다르므로", async () => {
    const { marketDivergenceCard } = await import("../src/keyword-cards/card-type");
    const make = (stockChangePct: number) =>
      marketDivergenceCard({
        divergence: {
          days: 4,
          indexChangePct: -1.7,
          stockChangePct,
          indexSeries: [100, 99, 98.5, 98.3, 98.3],
          stockSeries: [100, 101, 102, 103, 104],
        },
        indexLabel: "코스닥",
      });
    const a = make(5.2);
    const b = make(1.4);
    expect(a?.hook).not.toBe(b?.hook);
    expect(a?.hook).toContain("5.2");
    expect(b?.hook).toContain("1.4");
  });

  it("등락률을 못 재면 지어내지 않고 종전 문장을 쓴다", async () => {
    const { marketDivergenceCard } = await import("../src/keyword-cards/card-type");
    const card = marketDivergenceCard({
      divergence: {
        days: 4, indexChangePct: -1.7, stockChangePct: 0,
        indexSeries: [100, 99], stockSeries: [100, 101],
      },
      indexLabel: "코스닥",
    });
    expect(card?.hook).toBe("시장은 빠지는데\n이것만 버티고 있어요");
  });

  it("시장 역행 칩은 지수가 아니라 **격차**를 쓴다 — 같은 시장 카드가 같은 칩을 달지 않게", () => {
    const chips = (stockChangePct: number) =>
      buildQuietPickChips({
        ...base, kind: "market_divergence", indexChangePct: -1.7, indexLabel: "코스닥", stockChangePct,
      });
    expect(chips(5.2)).not.toEqual(chips(1.4));
  });
});

describe("한국어가 맞아야 한다", () => {
  it("지수 이름 뒤 조사가 받침을 따른다 — 「코스닥는」은 틀린 말이다", async () => {
    const { marketDivergenceCard } = await import("../src/keyword-cards/card-type");
    const make = (indexLabel: string) =>
      marketDivergenceCard({
        divergence: {
          days: 4, indexChangePct: -1.7, stockChangePct: 5.2,
          indexSeries: [100, 99, 98.5, 98.3, 98.3], stockSeries: [100, 101, 102, 103, 104],
        },
        indexLabel,
      })?.hook ?? "";
    expect(make("코스닥")).toContain("코스닥은"); // 받침 ㄱ
    expect(make("코스피")).toContain("코스피는"); // 받침 없음
    expect(make("나스닥")).toContain("나스닥은");
  });

  it("격차 칩은 소수 첫째 자리로 통일한다 — `7%p` 와 `7.6%p` 가 섞이지 않게", () => {
    const chip = buildQuietPickChips({
      ...base, kind: "market_divergence", indexChangePct: -1.7, indexLabel: "코스닥", stockChangePct: 5.3,
    }).find((c) => c.includes("%p"));
    expect(chip).toBe("코스닥보다 7.0%p 위");
  });
});
