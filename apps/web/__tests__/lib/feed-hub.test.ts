import { describe, expect, it } from "vitest";
import { FEED_ITEM_TYPES, interleaveFeedItems, type FeedHubItem } from "../../lib/feed-hub";

/**
 * 타입 레지스트리 회귀 방지 (WO 피드 통합 §4) —
 * "새 포맷 추가 = 기존 제거"가 피드 다양성 붕괴의 원인이었다.
 * 타입 제거는 명시 지시 없이 금지. 이 테스트가 그 원칙을 지킨다.
 */
describe("feed-hub 타입 레지스트리", () => {
  it("등록된 타입은 절대 줄지 않는다 (제거는 명시 지시 필요)", () => {
    const REQUIRED_TYPES = [
      "briefing",
      "buzz",
      "recap",
      "narrative",
      "sector",
      "index",
      "macro",
      "whale",
      "stock-issue",
      "macro-issue",
      "coin-issue",
      "hot-issue",
      "term",
      "event",
      "daily-receipt",
      "calendar",
    ];
    for (const type of REQUIRED_TYPES) {
      expect(FEED_ITEM_TYPES, `타입 "${type}" 이 레지스트리에서 사라졌다 — 명시 지시 없는 타입 제거는 금지`).toContain(type);
    }
    expect(FEED_ITEM_TYPES.length).toBeGreaterThanOrEqual(REQUIRED_TYPES.length);
  });
});

function contentItem(type: "index" | "macro" | "whale", id: string): FeedHubItem {
  return {
    type,
    scope: "KR",
    content: { kind: "content", id, contentType: type, scope: "domestic", headline: "h", facts: [{ label: "l", value: "+1%" }], source: "s", asOf: "2026-07-04" },
  };
}

describe("interleaveFeedItems", () => {
  it("같은 타입 연속 3개 금지", () => {
    const items: FeedHubItem[] = [
      contentItem("index", "a"),
      contentItem("index", "b"),
      contentItem("index", "c"),
      contentItem("macro", "d"),
      contentItem("whale", "e"),
    ];
    const ordered = interleaveFeedItems(items);
    for (let i = 2; i < ordered.length; i += 1) {
      const same = ordered[i]!.type === ordered[i - 1]!.type && ordered[i]!.type === ordered[i - 2]!.type;
      expect(same, `${i}번째에서 같은 타입 3연속`).toBe(false);
    }
    expect(ordered).toHaveLength(items.length); // 억지 삭제 금지 — 재배열만
  });

  it("전부 같은 타입이면 그대로 유지(삭제 금지)", () => {
    const items: FeedHubItem[] = [contentItem("index", "a"), contentItem("index", "b"), contentItem("index", "c")];
    expect(interleaveFeedItems(items)).toHaveLength(3);
  });
});

// 신선도 로테이션(WO 미장·코인 확충) — 어제와 같은 문구는 이틀 연속 금지.
import { selectDaily30Candidates } from "../../lib/daily-30";

describe("daily-30 freshness (모듈 로드 검증)", () => {
  it("selectDaily30Candidates 는 빈 후보에서 빈 덱(회귀 안전판)", () => {
    expect(selectDaily30Candidates([])).toEqual([]);
  });
});

describe("daily-30 자산군 바닥 (2026-07-12 미장 1장 사고)", () => {
  const cand = (id: string, assetClass: "kr-stock" | "us-stock" | "coin", quietScore: number) =>
    ({ kind: "stock", id, assetClass, quietScore, signalScore: quietScore, hypePenalty: 0 }) as unknown as Parameters<typeof selectDaily30Candidates>[0][number];

  it("KR이 quietScore 상위를 독식해도 미장은 바닥(8) 만큼 확보된다", () => {
    // KR 40장(전부 고득점) + US 10장(저득점). 바닥 없으면 US 0~1, 바닥 있으면 8.
    const kr = Array.from({ length: 40 }, (_, i) => cand(`kr${i}`, "kr-stock", 100 - i));
    const us = Array.from({ length: 10 }, (_, i) => cand(`us${i}`, "us-stock", 10 - i * 0.1));
    const deck = selectDaily30Candidates([...kr, ...us], 30);
    const usInDeck = deck.filter((c) => c.assetClass === "us-stock").length;
    expect(usInDeck).toBeGreaterThanOrEqual(8);
    expect(deck).toHaveLength(30);
  });

  it("US 후보가 바닥보다 적으면 있는 만큼만(억지 생성 없음)", () => {
    const kr = Array.from({ length: 40 }, (_, i) => cand(`kr${i}`, "kr-stock", 100 - i));
    const us = [cand("us0", "us-stock", 5), cand("us1", "us-stock", 4)];
    const deck = selectDaily30Candidates([...kr, ...us], 30);
    expect(deck.filter((c) => c.assetClass === "us-stock")).toHaveLength(2);
    expect(deck).toHaveLength(30);
  });
});

// 신선도 폴백(30장 유지) — 하드 제외가 주말(문구 불변)에 덱을 말린 회귀(실측 30→20) 방지.
import { stockCandidate, type FreshnessSnapshot } from "../../lib/daily-30";
import type { DiscoveryFrontSeed, DiscoveryStockPayload } from "../../lib/discovery-supply";

function stubStock(name: string, headline: string): DiscoveryStockPayload {
  return {
    canonical: name,
    market: "KOSPI",
    country: "KR",
    marquee: false,
    sector: "반도체",
    naverCode: "000001",
    headline,
  } as DiscoveryStockPayload;
}

function stubFront(): DiscoveryFrontSeed {
  return {
    signals: { changePct: 2.1, volumeRatio: 2.4 },
    fomo: { score: 50 } as unknown as DiscoveryFrontSeed["fomo"],
    sparkline: [100, 101, 102],
    priceText: "10,000원",
    verdict: { stance: "watch", stanceText: "관망", evidence: [], confidence: "low" } as NonNullable<DiscoveryFrontSeed["verdict"]>,
  };
}

describe("daily-30 신선도 폴백 (30장 유지 > 신선도)", () => {
  it("같은 문구 이틀 연속이어도 제외하지 않고 최후순위로 강등한다", () => {
    const freshness: FreshnessSnapshot = { headlines: new Map([["테스트종목", "거래량 평소 2.4배"]]) };
    const stale = stockCandidate(stubStock("테스트종목", "거래량 평소 2.4배"), stubFront(), freshness);
    expect(stale).not.toBeNull(); // 하드 제외 금지 — 30장 채움 폴백으로 살아있어야 한다
    expect(stale!.quietScore).toBeLessThan(-500); // 신선 후보가 항상 우선하도록 바닥 순위

    const fresh = stockCandidate(stubStock("다른종목", "새 재료가 나온 종목"), stubFront(), freshness);
    expect(fresh).not.toBeNull();
    expect(fresh!.quietScore).toBeGreaterThan(stale!.quietScore); // 신선 > 재탕
  });

  it("문구가 갱신되면(신호 갱신) 감점만 받고 정상 순위를 유지한다", () => {
    const freshness: FreshnessSnapshot = { headlines: new Map([["테스트종목", "어제 문구"]]) };
    const updated = stockCandidate(stubStock("테스트종목", "오늘 새 문구"), stubFront(), freshness);
    expect(updated).not.toBeNull();
    expect(updated!.quietScore).toBeGreaterThan(0);
  });

  it("30개 이상 검증된 신호 성과만 quietScore에 소폭 가점한다", () => {
    const stock = stubStock("성과종목", "외국인 4일 연속 순매수");
    const front = { ...stubFront(), signals: { ...stubFront().signals, foreignNetStreak: 4 } };
    const baseline = stockCandidate(stock, front)!;
    const boosted = stockCandidate(stock, front, undefined, {
      foreign_streak: { n: 60, winRate: 70, medianReturn: 3 },
    })!;
    const smallSample = stockCandidate(stock, front, undefined, {
      foreign_streak: { n: 29, winRate: 100, medianReturn: 10 },
    })!;
    expect(boosted.signalTypes).toContain("foreign_streak");
    expect(boosted.quietScore - baseline.quietScore).toBe(2);
    expect(smallSample.quietScore).toBe(baseline.quietScore);
  });
});

describe("capFeedItemsByType (2026-07-11 베리에이션)", () => {
  it("지수 카드는 상한 2장 — 팩트 분할 도배 차단, 다른 타입은 보존", async () => {
    const { capFeedItemsByType } = await import("../../lib/feed-hub");
    const items = [
      contentItem("index", "i1"),
      contentItem("index", "i2"),
      contentItem("index", "i3"),
      contentItem("index", "i4"),
      contentItem("macro", "m1"),
      contentItem("whale", "w1"),
    ];
    const capped = capFeedItemsByType(items);
    expect(capped.filter((item) => item.type === "index")).toHaveLength(2);
    expect(capped.filter((item) => item.type === "macro")).toHaveLength(1);
    expect(capped.filter((item) => item.type === "whale")).toHaveLength(1);
  });
});
