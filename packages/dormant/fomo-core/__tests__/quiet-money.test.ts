import { describe, expect, it } from "vitest";
import { buildQuietMoneyTimeline, normalizeQuietMoneyDate, quietMoneyStrength, type QuietMoneyEvent } from "../src";

const tradingDates = [
  "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10",
  "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17",
];

function event(actor: QuietMoneyEvent["actor"], date: string, overrides: Partial<QuietMoneyEvent> = {}): QuietMoneyEvent {
  return {
    date,
    actor,
    direction: "inflow",
    source: "확정 소스",
    label: `${actor} 유입`,
    priceAt: 100,
    ...overrides,
  };
}

describe("quiet money timeline", () => {
  it("KR 캔들 날짜 포맷을 ISO 거래일로 정규화한다", () => {
    expect(normalizeQuietMoneyDate("20260716")).toBe("2026-07-16");
    expect(normalizeQuietMoneyDate("2026.07.16")).toBe("2026-07-16");
    expect(normalizeQuietMoneyDate("2026-07-16")).toBe("2026-07-16");
  });

  it("10거래일 안 서로 다른 주체 2개부터 cluster_multi를 만든다", () => {
    const timeline = buildQuietMoneyTimeline({
      asOf: "2026-07-17",
      tradingDates,
      events: [event("insider", "2026-07-10"), event("institution", "2026-07-16", { streakDays: 6 })],
    });
    expect(timeline.cluster).toMatchObject({
      type: "cluster_multi",
      actors: ["insider", "institution"],
      actorCount: 2,
      windowTradingDays: 10,
    });
    expect(timeline.cluster?.headline).toBe("내부자·기관 동시 유입 · 10거래일 내 2개 주체");
    expect(timeline.cluster?.strength).toBeGreaterThanOrEqual(3);
  });

  it("같은 주체 여러 건이나 유출은 다중 주체 클러스터로 과장하지 않는다", () => {
    const timeline = buildQuietMoneyTimeline({
      asOf: "2026-07-17",
      tradingDates,
      events: [
        event("insider", "2026-07-14"),
        event("insider", "2026-07-16"),
        event("foreign", "2026-07-17", { direction: "outflow" }),
      ],
    });
    expect(timeline.events).toHaveLength(3);
    expect(timeline.cluster).toBeUndefined();
  });

  it("규모 비율은 실값이 있을 때만 강도에 반영한다", () => {
    const base = [event("insider", "2026-07-16"), event("institution", "2026-07-17")];
    expect(quietMoneyStrength(base, 2)).toBe(2);
    expect(quietMoneyStrength([...base, event("foreign", "2026-07-17", { marketCapRatioPct: 0.6 })], 3)).toBe(4);
  });
});
