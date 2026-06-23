import { describe, expect, it } from "vitest";
import { applyDiscoveryMetricEvent, type DiscoveryMetricState } from "../lib/discoveryMetrics";

function state(): DiscoveryMetricState {
  return {
    sessionId: "test-session",
    sessionStartedAt: 1_000,
    swipes: 0,
    rightSwipes: 0,
    leftSwipes: 0,
    depthOpens: 0,
    interestButtonClicks: 0,
    hydrateCompletions: 0,
    swipesBeforeHydrate: 0,
    reachedTenSwipes: false,
  };
}

describe("discovery metrics", () => {
  it("records first card and first swipe timing once", () => {
    let next = applyDiscoveryMetricEvent(state(), "first_card_display", { nowMs: 1_120 });
    next = applyDiscoveryMetricEvent(next, "first_card_display", { nowMs: 1_400 });
    next = applyDiscoveryMetricEvent(next, "swipe", { direction: "right", nowMs: 1_500, hydrated: true });
    next = applyDiscoveryMetricEvent(next, "swipe", { direction: "left", nowMs: 2_000, hydrated: true });

    expect(next.firstCardMs).toBe(120);
    expect(next.firstSwipeMs).toBe(500);
    expect(next.swipes).toBe(2);
    expect(next.rightSwipes).toBe(1);
    expect(next.leftSwipes).toBe(1);
  });

  it("counts depth, interest button, hydration, and pre-hydrate swipes", () => {
    let next = applyDiscoveryMetricEvent(state(), "card_hydrate");
    next = applyDiscoveryMetricEvent(next, "swipe", { direction: "left", elapsedMs: 30, hydrated: false });
    next = applyDiscoveryMetricEvent(next, "interest_button");
    next = applyDiscoveryMetricEvent(next, "depth_open");

    expect(next.hydrateCompletions).toBe(1);
    expect(next.swipesBeforeHydrate).toBe(1);
    expect(next.interestButtonClicks).toBe(1);
    expect(next.depthOpens).toBe(1);
  });

  it("marks sessions that reach ten swipes", () => {
    let next = state();
    for (let i = 0; i < 10; i += 1) {
      next = applyDiscoveryMetricEvent(next, "swipe", { direction: "right", elapsedMs: i, hydrated: true });
    }

    expect(next.swipes).toBe(10);
    expect(next.reachedTenSwipes).toBe(true);
  });
});
