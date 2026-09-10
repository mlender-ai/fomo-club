import { describe, expect, it } from "vitest";
import type { DiscoveryCandidate, DiscoveryEvent } from "@fomo/core";
import { axisStrength, formatAxisMetric, selectDominantAxis } from "../../lib/card-axis";

const asOf = "2026-06-30";

function candidate(events: DiscoveryEvent[]): DiscoveryCandidate {
  return {
    ticker: "테스트",
    market: "KOSPI",
    country: "KR",
    sector: "바이오",
    events,
    asOf,
  };
}

const materialEvent: DiscoveryEvent = {
  kind: "news_mention",
  firstSeen: true,
  strength: 0.9,
  source: "뉴스",
  asOf,
  confidence: "H",
  label: "심근세포 정제 특허 확보",
  sourceTitle: "티앤알바이오팹, 심근세포 정제 특허 확보",
  sourceName: "한국경제",
};

function priceMove(changePct: number): DiscoveryEvent {
  return {
    kind: "price_move",
    firstSeen: true,
    strength: 0.6,
    source: "market",
    asOf,
    confidence: "M",
    changePct,
  };
}

function flowEntry(flowDays: number, flowAmountText?: string): DiscoveryEvent {
  return {
    kind: "flow_entry",
    firstSeen: true,
    strength: 0.8,
    source: "supply",
    asOf,
    confidence: "M",
    label: "기관 순매수",
    flowActor: "institution",
    flowDays,
    ...(flowAmountText ? { flowAmountText } : {}),
  };
}

describe("selectDominantAxis", () => {
  it("selects price when price movement clears the threshold and beats supply", () => {
    const selected = selectDominantAxis(candidate([{ ...materialEvent, changePct: 12.4 }, priceMove(12.4)]));

    expect(selected).toBe("price");
  });

  it("selects supply when flow streak clears the threshold and is at least as strong as price", () => {
    const selected = selectDominantAxis(candidate([{ ...materialEvent, changePct: 4.2 }, priceMove(4.2), flowEntry(4, "18억원")]));

    expect(selected).toBe("supply");
    expect(formatAxisMetric(candidate([flowEntry(4, "18억원")]), "supply")).toBe("기관 4일 연속 순매수 18억원");
  });

  it("uses supply as the deterministic tie-break over price", () => {
    const selected = selectDominantAxis(candidate([{ ...materialEvent, changePct: 9 }, priceMove(9), flowEntry(3)]));

    const strength = axisStrength(candidate([priceMove(9), flowEntry(3)]));
    expect(strength.price).toBeCloseTo(0.6);
    expect(strength.supply).toBeCloseTo(0.6);
    expect(selected).toBe("supply");
  });

  it("falls back to material when price and supply are both weak", () => {
    const selected = selectDominantAxis(candidate([{ ...materialEvent, changePct: 2.1 }, priceMove(2.1), flowEntry(1)]));

    expect(selected).toBe("material");
  });

  it("is deterministic for the same input", () => {
    const input = candidate([{ ...materialEvent, changePct: 8.1 }, priceMove(8.1), flowEntry(2)]);
    const results = Array.from({ length: 10 }, () => selectDominantAxis(input));

    expect(new Set(results)).toEqual(new Set(["price"]));
  });
});
