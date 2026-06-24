import { describe, expect, it } from "vitest";
import {
  applyAxisRarity,
  buildAxisSignals,
  rankMultiAxisFeed,
  selectMultiAxisHook,
  type AxisSignal,
  type HookAxis,
} from "../src";

function sig(axis: HookAxis, strength: number, text: string): AxisSignal {
  return {
    axis,
    fired: true,
    strength,
    rarity: 0,
    hookText: text,
    evidence: [{ text, sourceKind: "market", source: "테스트", asOf: "오늘 기준" }],
  };
}

function item(id: string, axis: HookAxis, strength: number) {
  return { id, signals: [sig(axis, strength, `${id} 축 사실이에요.`)] };
}

describe("multi-axis hook selector", () => {
  it("희소성이 높은 축을 기본 우선으로 선택하고 결정적으로 반복된다", () => {
    const sets = applyAxisRarity([
      [sig("flow", 0.7, "기관이 4일째 사는 중이에요."), sig("time", 0.58, "공급계약 공시 소식이 나왔어요.")],
      [sig("flow", 0.7, "기관이 3일째 사는 중이에요.")],
      [sig("flow", 0.68, "외국인이 3일째 사는 중이에요.")],
      [sig("flow", 0.66, "기관이 5일째 사는 중이에요.")],
    ]);

    const first = selectMultiAxisHook(sets[0]);
    const second = selectMultiAxisHook(sets[0]);

    expect(first.axis).toBe("time");
    expect(first).toEqual(second);
  });

  it("strength override는 흔한 축이어도 대표 축으로 끌어올린다", () => {
    const sets = applyAxisRarity([
      [sig("flow", 0.95, "기관이 9일째 사는 중이에요."), sig("time", 0.62, "공급계약 공시 소식이 나왔어요.")],
      [sig("flow", 0.65, "외국인이 3일째 사는 중이에요.")],
      [sig("flow", 0.64, "기관이 3일째 사는 중이에요.")],
      [sig("flow", 0.63, "외국인이 4일째 사는 중이에요.")],
    ]);

    expect(selectMultiAxisHook(sets[0]).axis).toBe("flow");
  });

  it("피드 정렬은 동일 축이 MAX_AXIS_RUN을 초과해 연속되지 않게 만든다", () => {
    const rows = [
      item("a", "flow", 0.81),
      item("b", "flow", 0.8),
      item("c", "flow", 0.79),
      item("d", "price", 0.78),
      item("e", "price", 0.77),
      item("f", "herd", 0.76),
      item("g", "time", 0.75),
    ];

    const ranked = rankMultiAxisFeed(rows, {
      getSignals: (row) => row.signals,
      getKey: (row) => row.id,
      maxAxisRun: 2,
      interleaveEvery: 3,
    });
    const axes = ranked.map((row) => row.hook.axis);

    for (let i = 2; i < axes.length; i += 1) {
      expect([axes[i - 2], axes[i - 1], axes[i]]).not.toEqual([axes[i], axes[i], axes[i]]);
    }
    expect(rankMultiAxisFeed(rows, { getSignals: (row) => row.signals, getKey: (row) => row.id })).toEqual(
      rankMultiAxisFeed(rows, { getSignals: (row) => row.signals, getKey: (row) => row.id })
    );
  });

  it("evidence에는 커뮤니티 sourceKind를 만들지 않고 투자조언 금칙어를 피한다", () => {
    const signals = buildAxisSignals({
      signals: {
        foreignNetStreak: 4,
        newsEventLabel: "신규 공급계약 공시",
        newsEventSource: "거래소",
        themeLabel: "방산",
        themeRelativeRank: 1,
        themePeerCount: 5,
        changePct: 3.2,
      },
    });
    const joined = signals
      .flatMap((signal) => [signal.hookText, ...signal.evidence.map((e) => `${e.text} ${e.sourceKind}`)])
      .join(" ");

    expect(joined).not.toMatch(/community|매수|매도|목표가|급등\s?임박|추천|텐베거/);
  });

  it("schedule 데이터가 없으면 D-day를 지어내지 않는다", () => {
    const empty = buildAxisSignals({ signals: {} });
    const timeAxis = empty.find((signal) => signal.axis === "time");

    expect(timeAxis?.fired).toBe(false);
    expect(selectMultiAxisHook(empty).axis).toBe("fallback");
  });
});
