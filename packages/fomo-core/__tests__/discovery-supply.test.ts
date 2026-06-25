import { describe, expect, it } from "vitest";
import {
  discoveryWhy,
  eligibleUniverse,
  rankDiscoveryCandidates,
  type DiscoveryEventKind,
  type DiscoveryCandidate,
} from "../src";

const asOf = "2026-06-24";

function candidate(ticker: string, strength: number, kind: DiscoveryEventKind = "price_move", label?: string): DiscoveryCandidate {
  return {
    ticker,
    market: "KOSPI",
    events: [
      {
        kind,
        firstSeen: true,
        strength,
        source: kind === "news_mention" ? "뉴스" : "네이버 시세",
        asOf,
        confidence: "H",
        ...(label ?? kind === "news_mention" ? { label: label ?? "신규 공급계약 공시" } : {}),
      },
    ],
    asOf,
  };
}

describe("WO-05 discovery supply engine", () => {
  it("filters permanent risk flags and the dead liquidity tail only", () => {
    const result = eligibleUniverse([
      { ticker: "정상A", avgTradingValue20d: 100 },
      { ticker: "정상B", avgTradingValue20d: 90 },
      { ticker: "죽은거래", avgTradingValue20d: 3 },
      { ticker: "관리종목", avgTradingValue20d: 120, riskFlags: ["관리종목"] },
      { ticker: "단기과열", avgTradingValue20d: 120, riskFlags: ["단기과열"] },
    ]);

    expect(result.map((s) => s.ticker)).toEqual(["정상A", "정상B"]);
  });

  it("keeps candidates with real events and ranks public material above weak shape-only cards", () => {
    const ranked = rankDiscoveryCandidates([
      { ticker: "조용", market: "KOSPI", events: [], asOf },
      candidate("가격만", 0.9, "price_move"),
      candidate("뉴스", 0.55, "news_mention"),
    ]);

    expect(ranked.map((c) => c.ticker)).toEqual(["뉴스", "가격만"]);
  });

  it("applies seen decay but keeps watched stocks exempt", () => {
    const rows = [candidate("최근봄", 0.9, "news_mention"), candidate("처음봄", 0.8, "news_mention")];

    expect(rankDiscoveryCandidates(rows, { seen: [{ ticker: "최근봄", daysAgo: 0 }] })[0]?.ticker).toBe("처음봄");
    expect(rankDiscoveryCandidates(rows, { seen: [{ ticker: "최근봄", daysAgo: 0 }], watched: ["최근봄"] })[0]?.ticker).toBe("최근봄");
  });

  it("labels weak price-only material honestly instead of inventing a catalyst", () => {
    expect(discoveryWhy(candidate("가격만", 0.8))).toContain("뚜렷한 공개 재료는 확인 안 됨");
    expect(discoveryWhy(candidate("뉴스", 0.6, "news_mention"))).toContain("신규 공급계약 공시");
  });

  it("names research evidence as research instead of news", () => {
    const row = candidate("리서치", 0.7, "news_mention", "신규 설비 증설 점검");
    row.events[0]!.source = "한화투자증권 리서치";

    expect(discoveryWhy(row)).toContain("직접 다룬 리서치");
    expect(discoveryWhy(row)).not.toContain("언급한 뉴스");
  });

  it("selects WHY by source strength order before raw numeric strength", () => {
    const row: DiscoveryCandidate = {
      ticker: "동시보유",
      market: "KOSPI",
      asOf,
      events: [
        { kind: "price_move", firstSeen: true, strength: 1, source: "가격", asOf, confidence: "H", label: "오늘 가격이 +20.00% 움직였어요." },
        { kind: "theme_link", firstSeen: true, strength: 0.7, source: "섹터맵", asOf, confidence: "M", label: "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요." },
        { kind: "flow_entry", firstSeen: true, strength: 0.55, source: "KRX 수급", asOf, confidence: "H", label: "외국인이 2일째 사는 중이에요." },
        { kind: "news_mention", firstSeen: true, strength: 0.45, source: "뉴스", asOf, confidence: "H", label: "단독 기사" },
        { kind: "disclosure", firstSeen: true, strength: 0.35, source: "DART", asOf, confidence: "H", label: "공급계약" },
      ],
    };

    expect(discoveryWhy(row)).toContain("공급계약");
  });

  it("ranks contextual theme links above market context but below material events", () => {
    const ranked = rankDiscoveryCandidates([
      candidate("시장맥락", 0.65, "market_context", "KOSPI 시총 상위권에서 오늘 +1.2% 움직였어요."),
      candidate("테마", 0.55, "theme_link", "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요."),
      candidate("수급", 0.5, "flow_entry", "기관이 3일째 사는 중이에요."),
    ]);

    expect(ranked.map((c) => c.ticker)).toEqual(["수급", "테마", "시장맥락"]);
  });

  it("keeps the deck full when market context gives every card a real reason", () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
      candidate(`시장${index}`, 0.35 + (index % 10) / 100, "market_context", `KOSPI 시총 ${index + 1}위권에서 오늘 시장 흐름과 같이 확인해요.`)
    );
    const ranked = rankDiscoveryCandidates(rows, { maxCandidates: 100 });

    expect(ranked).toHaveLength(100);
    expect(ranked.every((row) => discoveryWhy(row).length > 0)).toBe(true);
  });
});
