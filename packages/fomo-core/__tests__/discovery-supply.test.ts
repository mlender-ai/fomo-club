import { describe, expect, it } from "vitest";
import {
  discoveryWhy,
  eligibleUniverse,
  hasDisplayWhyEvent,
  isWeakDiscoveryCandidate,
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

  it("keeps candidates with real events and drops weak shape-only cards", () => {
    const ranked = rankDiscoveryCandidates([
      { ticker: "조용", market: "KOSPI", events: [], asOf },
      candidate("가격만", 0.9, "price_move"),
      candidate("뉴스", 0.55, "news_mention"),
    ]);

    expect(ranked.map((c) => c.ticker)).toEqual(["뉴스"]);
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

  it("keeps contextual theme links and drops weak market context", () => {
    const ranked = rankDiscoveryCandidates([
      candidate("시장맥락", 0.65, "market_context", "KOSPI 시총 상위권에서 오늘 +1.2% 움직였어요."),
      candidate("테마", 0.55, "theme_link", "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요."),
      candidate("수급", 0.5, "flow_entry", "기관이 3일째 사는 중이에요."),
    ]);

    expect(ranked.map((c) => c.ticker)).toEqual(["수급", "테마"]);
  });

  it("does not treat market context as a real display WHY", () => {
    const market = candidate("시장맥락", 0.55, "market_context", "KOSPI 시총 상위권에서 오늘 +1.2% 움직였어요.");
    const theme = candidate("테마", 0.55, "theme_link", "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요.");

    expect(hasDisplayWhyEvent(market)).toBe(false);
    expect(isWeakDiscoveryCandidate(market)).toBe(true);
    expect(hasDisplayWhyEvent(theme)).toBe(true);
    expect(isWeakDiscoveryCandidate(theme)).toBe(false);
  });

  it("does not treat flat or bearish theme comparison as a top-band display WHY", () => {
    const flatTheme = candidate("보합방어", 0.72, "theme_link", "AI 평균(-3.00%)이 약한 날, 이 종목은 보합으로 버텼어요.");
    flatTheme.events[0]!.direction = "flat";
    const downTheme = candidate("약세비교", 0.72, "theme_link", "오늘 AI 평균(-3.00%)보다 1.8포인트 더 약했어요(-4.81%).");
    downTheme.events[0]!.direction = "down";
    const upTheme = candidate("상승선두", 0.45, "theme_link", "오늘 원자력 7개 종목 중 가장 강했어요(+6.20%).");
    upTheme.events[0]!.direction = "up";

    expect(hasDisplayWhyEvent(flatTheme)).toBe(false);
    expect(isWeakDiscoveryCandidate(flatTheme)).toBe(true);
    expect(hasDisplayWhyEvent(downTheme)).toBe(false);
    expect(isWeakDiscoveryCandidate(downTheme)).toBe(true);
    expect(hasDisplayWhyEvent(upTheme)).toBe(true);
    expect(rankDiscoveryCandidates([flatTheme, downTheme, upTheme]).map((row) => row.ticker)).toEqual(["상승선두"]);
  });

  it("drops weak market-context padding instead of filling the deck with price restatements", () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
      candidate(`시장${index}`, 0.35 + (index % 10) / 100, "market_context", `KOSPI 시총 ${index + 1}위권에서 오늘 시장 흐름과 같이 확인해요.`)
    );
    const ranked = rankDiscoveryCandidates(rows, { maxCandidates: 100 });

    expect(ranked).toHaveLength(0);
  });

  it("keeps real WHY cards and drops price-only cards even when price-only strength is larger", () => {
    const priceOnly = candidate("가격만큰종목", 1, "price_move", "오늘 가격이 +18.00% 움직였어요.");
    const themeWhy = candidate("테마이유", 0.45, "theme_link", "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요.");
    const materialWhy = candidate("뉴스이유", 0.4, "news_mention", "종목 지정 기사");

    expect(rankDiscoveryCandidates([priceOnly, themeWhy, materialWhy]).map((row) => row.ticker)).toEqual([
      "뉴스이유",
      "테마이유",
    ]);
  });

  it("ranks obscure stocks above famous stocks at the same signal strength", () => {
    const famous = candidate("대형주", 0.7, "news_mention", "대형주 기사");
    famous.marketCapRank = 3;
    const obscure = candidate("무명주", 0.7, "news_mention", "무명주 기사");
    obscure.marketCapRank = 250;

    expect(rankDiscoveryCandidates([famous, obscure]).map((row) => row.ticker)).toEqual(["무명주", "대형주"]);
  });

  it("drops non-material direction-only price moves instead of ranking them as discovery", () => {
    const up = candidate("상승", 0.9, "price_move", "오늘 가격이 +9.00% 움직였어요.");
    up.events[0]!.direction = "up";
    const down = candidate("하락", 0.9, "price_move", "오늘 가격이 -9.00% 움직였어요.");
    down.events[0]!.direction = "down";

    expect(rankDiscoveryCandidates([down, up]).map((row) => row.ticker)).toEqual([]);
  });

  it("boosts obscure first-seen awakening over stale same-strength candidates", () => {
    const stale = candidate("기존무명", 0.7, "theme_link", "오늘 원자력 평균보다 강했어요.");
    stale.marketCapRank = 260;
    stale.events[0]!.firstSeen = false;
    const awakening = candidate("각성무명", 0.7, "theme_link", "오늘 원자력 평균보다 강했어요.");
    awakening.marketCapRank = 260;

    expect(rankDiscoveryCandidates([stale, awakening]).map((row) => row.ticker)).toEqual(["각성무명", "기존무명"]);
  });

  it("keeps legacy candidates without rank or direction safe and deterministic", () => {
    const rows = [
      candidate("B", 0.6, "news_mention", "B 기사"),
      candidate("A", 0.6, "news_mention", "A 기사"),
    ];

    const first = rankDiscoveryCandidates(rows).map((row) => row.ticker);
    const second = rankDiscoveryCandidates(rows).map((row) => row.ticker);

    expect(first).toEqual(["B", "A"]);
    expect(second).toEqual(first);
  });

  it("keeps first-seen volume awakenings even below the weak strength floor", () => {
    const ranked = rankDiscoveryCandidates([
      candidate("거래량각성", 0.4, "volume_spike", "오늘 거래량이 새로 튀었어요."),
      candidate("가격약함", 0.4, "price_move", "오늘 가격이 +4.00% 움직였어요."),
    ]);

    expect(ranked.map((row) => row.ticker)).toEqual(["거래량각성"]);
  });
});
