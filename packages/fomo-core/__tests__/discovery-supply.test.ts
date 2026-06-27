import { describe, expect, it } from "vitest";
import {
  discoveryWhy,
  eligibleUniverse,
  hasDeckDisplayEvent,
  hasDisplayWhyEvent,
  isWeakDiscoveryCandidate,
  isDiscoveryAwakening,
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

  it("does not treat positive price-only events as display hooks", () => {
    const priceUp = candidate("가격만", 0.8, "price_move", "오늘 가격이 +8.00% 움직였어요.");
    priceUp.events[0]!.direction = "up";
    expect(hasDeckDisplayEvent(priceUp)).toBe(false);
    expect(hasDisplayWhyEvent(priceUp)).toBe(false);
    expect(discoveryWhy(priceUp)).toBe("오늘 확인된 사건이 아직 없어요.");
    expect(discoveryWhy(candidate("뉴스", 0.6, "news_mention"))).toContain("신규 공급계약 공시");
  });

  it("surfaces the concrete research label instead of wrapping it in a generic source sentence", () => {
    const row = candidate("리서치", 0.7, "news_mention", "신규 설비 증설 점검");
    row.events[0]!.source = "한화투자증권 리서치";

    expect(discoveryWhy(row)).toBe("오늘 신규 설비 증설 점검");
    expect(discoveryWhy(row)).not.toContain("언급한 뉴스");
    expect(discoveryWhy(row)).not.toContain("직접 다룬 리서치");
  });

  it("surfaces the concrete linked article label instead of wrapping it in a generic source sentence", () => {
    const row = candidate("연결기사", 0.7, "news_mention", "업종 흐름 기사");
    row.events[0]!.source = "네이버 종목뉴스 연결";

    expect(discoveryWhy(row)).toBe("오늘 업종 흐름 기사");
    expect(discoveryWhy(row)).not.toContain("직접 언급한 뉴스");
    expect(discoveryWhy(row)).not.toContain("뉴스 탭에 함께 묶인 흐름");
  });

  it("ranks direct material above linked stock-tab material", () => {
    const linked = candidate("연결기사", 0.9, "news_mention", "연결 기사");
    linked.events[0]!.source = "네이버 종목뉴스 연결";
    const direct = candidate("직접기사", 0.55, "news_mention", "직접 기사");

    expect(rankDiscoveryCandidates([linked, direct]).map((row) => row.ticker)).toEqual(["직접기사", "연결기사"]);
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

  it("keeps constructive theme context but drops generic market context from the deck", () => {
    const market = candidate("시장맥락", 0.65, "market_context", "KOSPI 시총 상위권에서 오늘 +1.2% 움직였어요.");
    const theme = candidate("테마", 0.55, "theme_link", "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요.");
    theme.events[0]!.direction = "up";
    const flow = candidate("수급", 0.5, "flow_entry", "기관이 3일째 사는 중이에요.");
    const ranked = rankDiscoveryCandidates([market, theme, flow]);

    expect(ranked.map((c) => c.ticker)).toEqual(["수급", "테마"]);
  });

  it("treats constructive theme context as display WHY but keeps generic market context weak", () => {
    const market = candidate("시장맥락", 0.55, "market_context", "KOSPI 시총 상위권에서 오늘 +1.2% 움직였어요.");
    const theme = candidate("테마", 0.55, "theme_link", "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요.");
    theme.events[0]!.direction = "up";

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

  it("drops price-only cards but keeps constructive theme context", () => {
    const priceOnly = candidate("가격만큰종목", 1, "price_move", "오늘 가격이 +18.00% 움직였어요.");
    priceOnly.events[0]!.direction = "up";
    const themeWhy = candidate("테마이유", 0.45, "theme_link", "오늘 원자력 흐름이 셌고, 이 종목이 거기 묶여 있어요.");
    themeWhy.events[0]!.direction = "up";
    const materialWhy = candidate("뉴스이유", 0.4, "news_mention", "종목 지정 기사");

    expect(rankDiscoveryCandidates([priceOnly, themeWhy, materialWhy]).map((row) => row.ticker)).toEqual(["뉴스이유", "테마이유"]);
  });

  it("ranks obscure stocks above famous stocks at the same signal strength", () => {
    const famous = candidate("대형주", 0.7, "news_mention", "대형주 기사");
    famous.marketCapRank = 3;
    const obscure = candidate("무명주", 0.7, "news_mention", "무명주 기사");
    obscure.marketCapRank = 250;

    expect(rankDiscoveryCandidates([famous, obscure]).map((row) => row.ticker)).toEqual(["무명주", "대형주"]);
  });

  it("keeps famous marquee stocks out of the front band when obscure hooks exist", () => {
    const obscureRows = Array.from({ length: 12 }, (_, index) => {
      const row = candidate(`무명${index}`, 0.58 + index / 100, "news_mention", `무명 기사 ${index}`);
      row.marketCapRank = 180 + index;
      return row;
    });
    const samsung = candidate("삼성전자", 0.95, "news_mention", "삼성전자 기사");
    samsung.marketCapRank = 1;
    samsung.marquee = true;
    const hynix = candidate("SK하이닉스", 0.94, "news_mention", "SK하이닉스 기사");
    hynix.marketCapRank = 2;
    hynix.marquee = true;

    const firstTen = rankDiscoveryCandidates([samsung, hynix, ...obscureRows], { maxCandidates: 14 })
      .slice(0, 10)
      .map((row) => row.ticker);

    expect(firstTen).not.toContain("삼성전자");
    expect(firstTen).not.toContain("SK하이닉스");
  });

  it("can expand to a 50-card deck without promoting famous names into the front band", () => {
    const obscureRows = Array.from({ length: 55 }, (_, index) => {
      const row = candidate(`발굴${index}`, 0.42 + (index % 18) / 100, index % 5 === 0 ? "disclosure" : "news_mention", `발굴 근거 ${index}`);
      row.marketCapRank = 90 + index;
      return row;
    });
    const famousRows = ["삼성전자", "SK하이닉스", "NAVER", "카카오"].map((ticker, index) => {
      const row = candidate(ticker, 0.96 - index / 100, "news_mention", `${ticker} 기사`);
      row.marketCapRank = index + 1;
      row.marquee = true;
      return row;
    });

    const ranked = rankDiscoveryCandidates([...famousRows, ...obscureRows], { maxCandidates: 50 });
    const firstBand = ranked.slice(0, 16).map((row) => row.ticker);
    const tickers = ranked.map((row) => row.ticker);

    expect(ranked).toHaveLength(50);
    expect(firstBand).not.toContain("삼성전자");
    expect(firstBand).not.toContain("SK하이닉스");
    expect(firstBand).not.toContain("NAVER");
    expect(firstBand).not.toContain("카카오");
    expect(tickers).toContain("삼성전자");
    expect(tickers).toContain("SK하이닉스");
    expect(tickers).toContain("NAVER");
    expect(tickers).toContain("카카오");
    expect(tickers.indexOf("삼성전자")).toBeGreaterThanOrEqual(16);
    expect(tickers.indexOf("SK하이닉스")).toBeGreaterThanOrEqual(16);
    expect(tickers.indexOf("NAVER")).toBeGreaterThanOrEqual(16);
    expect(tickers.indexOf("카카오")).toBeGreaterThanOrEqual(16);
    expect(ranked.every(hasDeckDisplayEvent)).toBe(true);
  });

  it("drops price-only moves regardless of direction", () => {
    const up = candidate("상승", 0.9, "price_move", "오늘 가격이 +9.00% 움직였어요.");
    up.events[0]!.direction = "up";
    const down = candidate("하락", 0.9, "price_move", "오늘 가격이 -9.00% 움직였어요.");
    down.events[0]!.direction = "down";

    expect(hasDeckDisplayEvent(up)).toBe(false);
    expect(hasDeckDisplayEvent(down)).toBe(false);
    expect(rankDiscoveryCandidates([down, up]).map((row) => row.ticker)).toEqual([]);
  });

  it("boosts obscure first-seen awakening over stale same-strength candidates", () => {
    const stale = candidate("기존무명", 0.7, "news_mention", "종목 지정 기사");
    stale.marketCapRank = 260;
    stale.events[0]!.firstSeen = false;
    const awakening = candidate("각성무명", 0.7, "news_mention", "종목 지정 기사");
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
    const volume = candidate("거래량각성", 0.4, "volume_spike", "오늘 거래량이 새로 튀었어요.");
    volume.events[0]!.direction = "up";
    const weakPrice = candidate("가격약함", 0.4, "price_move", "오늘 가격이 +4.00% 움직였어요.");
    weakPrice.events[0]!.direction = "up";
    const ranked = rankDiscoveryCandidates([volume, weakPrice]);

    expect(ranked.map((row) => row.ticker)).toEqual(["거래량각성"]);
  });

  it("allows 💎 awakening only for obscure non-down first-seen flow/disclosure/volume signals", () => {
    const obscureFlow = candidate("무명수급", 0.65, "flow_entry", "외국인이 오늘 새로 담기 시작했어요.");
    obscureFlow.marketCapRank = 220;
    obscureFlow.events[0]!.direction = "up";
    const famousFlow = candidate("대형수급", 0.65, "flow_entry", "외국인이 오늘 새로 담기 시작했어요.");
    famousFlow.marketCapRank = 5;
    famousFlow.events[0]!.direction = "up";
    const downFlow = candidate("하락수급", 0.65, "flow_entry", "외국인이 오늘 새로 담기 시작했어요.");
    downFlow.marketCapRank = 220;
    downFlow.events[0]!.direction = "down";
    const newsOnly = candidate("뉴스만", 0.65, "news_mention", "공급계약 뉴스");
    newsOnly.marketCapRank = 220;
    newsOnly.events[0]!.direction = "up";

    expect(isDiscoveryAwakening(obscureFlow)).toBe(true);
    expect(isDiscoveryAwakening(famousFlow)).toBe(false);
    expect(isDiscoveryAwakening(downFlow)).toBe(false);
    expect(isDiscoveryAwakening(newsOnly)).toBe(false);
  });

  it("excludes evergreen company blurb-only rows from display and ranking", () => {
    const evergreen: DiscoveryCandidate = {
      ticker: "회사소개",
      market: "KOSPI",
      asOf,
      reason: "새로운 시장을 여는 플랫폼 리더로 도약 중",
      events: [],
    };

    expect(hasDeckDisplayEvent(evergreen)).toBe(false);
    expect(hasDisplayWhyEvent(evergreen)).toBe(false);
    expect(rankDiscoveryCandidates([evergreen])).toEqual([]);
  });

  it("keeps the whole deck free of price-only, flat, down, no-event, and market-context rows", () => {
    const material = Array.from({ length: 4 }, (_, index) => candidate(`공시${index}`, 0.4 + index / 100, "disclosure", `공시 ${index}`));
    const theme = Array.from({ length: 3 }, (_, index) => {
      const row = candidate(`테마${index}`, 0.55 + index / 100, "theme_link", `오늘 원자력 흐름 ${index}`);
      row.events[0]!.direction = "up";
      return row;
    });
    const price = Array.from({ length: 5 }, (_, index) => {
      const row = candidate(`가격상승${index}`, 0.9 - index / 100, "price_move", `오늘 가격이 +${8 + index}.00% 움직였어요.`);
      row.events[0]!.direction = "up";
      return row;
    });
    const rejected = [
      candidate("보합", 0.9, "price_move", "오늘 가격이 0.00% 움직였어요."),
      candidate("하락", 0.9, "price_move", "오늘 가격이 -9.00% 움직였어요."),
      candidate("시장맥락", 0.9, "market_context", "KOSPI 시총 상위권에서 오늘 시장 흐름과 같이 확인해요."),
    ];
    rejected[0]!.events[0]!.direction = "flat";
    rejected[1]!.events[0]!.direction = "down";

    const ranked = rankDiscoveryCandidates([...rejected, ...price, ...theme, ...material], { maxCandidates: 20 });
    expect(ranked.slice(0, 10).every(hasDeckDisplayEvent)).toBe(true);
    expect(ranked.map((row) => row.ticker)).toEqual(["공시3", "공시2", "공시1", "공시0", "테마2", "테마1", "테마0"]);
    expect(ranked.map((row) => row.ticker)).not.toContain("보합");
    expect(ranked.map((row) => row.ticker)).not.toContain("하락");
    expect(ranked.map((row) => row.ticker)).not.toContain("시장맥락");
  });
});
