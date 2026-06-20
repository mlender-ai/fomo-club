import { describe, expect, it } from "vitest";
import { calculateProductMetrics, type TasteMetricEvent } from "../fomo-product-metrics-core";

const at = (actorId: string, signal: TasteMetricEvent["signal"], iso: string): TasteMetricEvent => ({
  actorId,
  signal,
  createdAt: new Date(iso),
});

describe("calculateProductMetrics", () => {
  it("D1/D7 참여 리텐션과 세션 행동을 계산한다", () => {
    const events: TasteMetricEvent[] = [
      at("a", "MORE", "2026-06-01T01:00:00Z"),
      at("a", "VIEW_DEPTH", "2026-06-01T01:05:00Z"),
      at("a", "LESS", "2026-06-02T01:00:00Z"),
      at("a", "MORE", "2026-06-08T01:00:00Z"),
      at("b", "LESS", "2026-06-01T02:00:00Z"),
      at("b", "MORE", "2026-06-01T02:10:00Z"),
    ];

    const result = calculateProductMetrics(events, new Date("2026-06-20T12:00:00Z"));

    expect(result.activeActors30d).toBe(2);
    expect(result.engagedSessions30d).toBe(4);
    expect(result.swipes30d).toBe(5);
    expect(result.depthViews30d).toBe(1);
    expect(result.swipesPerSession).toBe(1.25);
    expect(result.sessionsWithDepthRate).toEqual({ numerator: 1, denominator: 4, rate: 0.25 });
    expect(result.d1EngagedRetention).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(result.d7EngagedRetention).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });

  it("표본이 없으면 비율을 0으로 꾸미지 않고 null로 둔다", () => {
    const result = calculateProductMetrics([], new Date("2026-06-20T12:00:00Z"));
    expect(result.swipesPerSession).toBeNull();
    expect(result.d1EngagedRetention.rate).toBeNull();
    expect(result.d7EngagedRetention.rate).toBeNull();
  });

  it("30분을 초과한 행동은 새 세션으로 센다", () => {
    const events = [
      at("a", "MORE", "2026-06-20T01:00:00Z"),
      at("a", "LESS", "2026-06-20T01:30:00Z"),
      at("a", "MORE", "2026-06-20T02:00:01Z"),
    ];
    const result = calculateProductMetrics(events, new Date("2026-06-20T12:00:00Z"));
    expect(result.engagedSessions30d).toBe(2);
  });
});
