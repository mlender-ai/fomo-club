import { describe, expect, it } from "vitest";
import type {
  StockDef,
  InvestorFlow,
  CardVerdict,
  WyckoffAnalysis,
  CompanyScoreResult,
  DailyOhlcv,
} from "@fomo/core";
import { buildQuietPickResponse, type QuietPickDeps, type KrMarketRow } from "../../lib/quiet-pick";
import type { StockFrontData } from "../../lib/stock-front";
import type { InsiderClusterCandidate } from "../../lib/insider-source";
import type { StockAttentionSignal } from "../../lib/stock-signal-coverage";

const TODAY = "2026-07-20";

const VOCAB: StockDef[] = [
  { canonical: "조용외인", aliases: [], market: "KOSDAQ", country: "KR", naverCode: "111111" },
  { canonical: "다중클러스터", aliases: [], market: "KOSPI", country: "KR", naverCode: "222222" },
  { canonical: "화제종목", aliases: [], market: "KOSDAQ", country: "KR", naverCode: "333333" },
  { canonical: "급등종목", aliases: [], market: "KOSDAQ", country: "KR", naverCode: "444444" },
  { canonical: "삼성전자", aliases: [], market: "KOSPI", country: "KR", naverCode: "005930", marquee: true },
  { canonical: "무신호", aliases: [], market: "KOSDAQ", country: "KR", naverCode: "555555" },
];

/** 최신순 flows(store 규약). foreignDays/instDays 연속 순매수, 그 앞은 순매도로 끊음. */
function flows(foreignDays: number, instDays: number): InvestorFlow[] {
  const out: InvestorFlow[] = [];
  for (let i = 0; i < 10; i += 1) {
    const day = 20 - i; // 07-20, 07-19, ... 최신순
    out.push({
      date: `2026-07-${String(day).padStart(2, "0")}`,
      foreignNet: i < foreignDays ? 30_000 : -5_000,
      institutionNet: i < instDays ? 20_000 : -5_000,
    });
  }
  return out;
}

function candles(): DailyOhlcv[] {
  const out: DailyOhlcv[] = [];
  for (let i = 0; i < 80; i += 1) {
    out.push({ date: `2026${String(5 + Math.floor(i / 31)).padStart(2, "0")}${String((i % 31) + 1).padStart(2, "0")}`, open: 1000, high: 1010, low: 990, close: 1000, volume: 100_000 });
  }
  return out;
}

function score(value: number): CompanyScoreResult {
  return { score: value, status: "ready", label: "평가 라벨", interpretation: "결론·근거·관전", axes: [], axisStates: [], availableAxisCount: 5, omittedAxes: [] };
}

function verdict(): CardVerdict {
  return { stance: "watch", stanceText: "관망", evidence: ["이격 1%"], confidence: "medium", invalidation: "1,000원 아래면 무효", invalidationLevel: 1000 };
}

function wyckoff(): WyckoffAnalysis {
  return {
    sourceLength: 80,
    currentZone: { kind: "accumulation", startIndex: 0, endIndex: 20, weeks: 3, low: 900, high: 1100, rangePct: 20, priceChangePct: 4, label: "매집 구간", evidence: ["박스 3주"] },
    zones: [],
    events: [],
    summary: "매집 구간에서 눌림 중",
  };
}

/** 카나니컬별로 제어하는 가짜 프론트. priceText 로 현재가(누적 상승) 제어. */
function frontFor(priceText: string, changePct: number): StockFrontData {
  return {
    signals: { changePct },
    score: score(72),
    sparkline: [980, 990, 1000],
    candles: candles(),
    verdict: verdict(),
    wyckoff: wyckoff(),
    priceText,
  };
}

interface Scenario {
  attention: Record<string, StockAttentionSignal>;
  marketRows: KrMarketRow[];
  histories: Record<string, InvestorFlow[]>;
  insiders: InsiderClusterCandidate[];
  fronts: Record<string, StockFrontData>;
}

function depsFrom(s: Scenario): Partial<QuietPickDeps> {
  return {
    vocab: VOCAB,
    readSupplyDemandHistoryByTickers: async () => s.histories,
    computeStockAttentionSignals: async () => s.attention,
    fetchKrMarketRows: async () => s.marketRows,
    fetchInsiderClusterCandidates: async () => s.insiders,
    fetchMarketCapRankMap: async () => ({}),
    assembleStockFront: async (stock: string) => s.fronts[stock] ?? frontFor("1,000원", 1),
  };
}

const quietRow = (naverCode: string, changePct: number, tradingValue: number): KrMarketRow =>
  ({ canonical: naverCode, symbol: naverCode, naverCode, changePct, tradingValue } as unknown as KrMarketRow);

const quietAttention = (score: number): StockAttentionSignal => ({ mentionCount: score, mentionScore: score });

function baseScenario(): Scenario {
  return {
    attention: {
      조용외인: quietAttention(10),
      다중클러스터: quietAttention(5),
      화제종목: quietAttention(90), // 화제성 초과
      급등종목: quietAttention(10),
      삼성전자: quietAttention(5),
      무신호: quietAttention(5),
    },
    marketRows: [
      // 조용한 후보는 유동성 하한(10억) 이상이되 거래대금 순위는 하위(top-20 밖).
      quietRow("111111", 2, 2_000_000_000),
      quietRow("222222", 1, 2_000_000_000),
      quietRow("333333", 2, 2_000_000_000),
      quietRow("444444", 18, 2_000_000_000), // 당일 +18% → 급등
      quietRow("005930", 1, 900_000_000_000),
      quietRow("555555", 1, 2_000_000_000),
      // 거래대금 상위를 채우는 필러 25종(top-20 게이트가 실제로 작동하도록).
      ...Array.from({ length: 25 }, (_, i) => quietRow(`F${String(i).padStart(4, "0")}`, 1, 500_000_000_000)),
    ],
    histories: {
      "111111": flows(4, 0), // 외인 4일
      "222222": flows(3, 3), // 다중(외인+기관)
      "333333": flows(4, 0), // 신호 있으나 화제성 초과 → 탈락
      "444444": flows(4, 0), // 신호 있으나 급등 → 탈락
      "005930": flows(9, 9), // marquee → 유니버스 제외
      "555555": flows(1, 1), // 신호 없음
    },
    insiders: [],
    fronts: {
      조용외인: frontFor("1,020원", 2),
      다중클러스터: frontFor("1,010원", 1),
    },
  };
}

describe("buildQuietPickResponse — 자격 규칙(결정론)", () => {
  it("KR 외인 streak·다중 클러스터를 픽으로 선별하고 강도순 정렬(다중 우선)", async () => {
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(baseScenario()) });
    const names = res.picks.map((p) => p.subject.canonical);
    expect(names).toContain("조용외인");
    expect(names).toContain("다중클러스터");
    // 다중 클러스터가 단일 streak보다 강도 우선.
    expect(names.indexOf("다중클러스터")).toBeLessThan(names.indexOf("조용외인"));
    const multi = res.picks.find((p) => p.subject.canonical === "다중클러스터")!;
    expect(multi.signal.kind).toBe("multi_cluster");
    expect(multi.signal.code).toBe("cluster_multi");
  });

  it("화제성 초과·당일 급등·marquee·무신호는 탈락", async () => {
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(baseScenario()) });
    const names = res.picks.map((p) => p.subject.canonical);
    expect(names).not.toContain("화제종목");
    expect(names).not.toContain("급등종목");
    expect(names).not.toContain("삼성전자");
    expect(names).not.toContain("무신호");
    expect(res.qualification.drops.mention_hot).toBeGreaterThanOrEqual(1);
    // marquee(삼성전자)는 유니버스 자체에서 제외 → krWithSignal 에 미포함.
    expect(res.qualification.krUniverse).toBe(VOCAB.filter((d) => d.naverCode && !d.marquee).length);
  });

  it("신호 후 누적 +30% 이상이면 탈락(이미 재평가된 건 발굴 아님)", async () => {
    const s = baseScenario();
    s.fronts["조용외인"] = frontFor("1,400원", 3); // 신호가 1000 → +40%
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("조용외인");
    expect(res.qualification.drops.ran_30_since_signal).toBeGreaterThanOrEqual(1);
  });

  it("US 내부자 클러스터: $200k+·2인+·최근만 선별, 소액/단독은 탈락", async () => {
    const s = baseScenario();
    s.attention["BigCluster Inc"] = quietAttention(5);
    s.attention["Tiny Inc"] = quietAttention(5);
    s.insiders = [
      { symbol: "BIGC", companyName: "BigCluster Inc", insiderCount: 3, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 4_600_000, buyPrice: 50, quote: { price: 51, changePct: 2 } },
      { symbol: "TINY", companyName: "Tiny Inc", insiderCount: 1, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 4_600_000, buyPrice: 10 },
      { symbol: "SMALL", companyName: "Small Inc", insiderCount: 2, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 50_000, buyPrice: 10 },
    ];
    s.fronts["BigCluster Inc"] = frontFor("$51", 2);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    const names = res.picks.map((p) => p.subject.canonical);
    expect(names).toContain("BigCluster Inc");
    expect(names).not.toContain("Tiny Inc");
    expect(names).not.toContain("Small Inc");
    const pick = res.picks.find((p) => p.subject.canonical === "BigCluster Inc")!;
    expect(pick.signal.actors).toBe("내부자 3명");
    expect(pick.signal.scale).toBe("$4.6M");
    expect(pick.hook).toContain("$4.6M");
  });

  it("억지 충원 금지: 자격 통과가 적으면 그 수만큼만 발행", async () => {
    const s = baseScenario();
    // 조용외인만 신호 남기고 나머지 KR 신호 제거.
    s.histories["222222"] = flows(1, 1);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.length).toBe(1);
    expect(res.picks[0]!.subject.canonical).toBe("조용외인");
    expect(res.qualification.published).toBe(1);
  });

  it("품질 게이트: verdict 없음·캔들 부족이면 탈락", async () => {
    const s = baseScenario();
    const { verdict: _omitVerdict, ...noVerdict } = frontFor("1,010원", 1);
    const shortCandles: StockFrontData = { ...frontFor("1,010원", 1), candles: candles().slice(0, 30) };
    s.fronts["조용외인"] = noVerdict;
    s.fronts["다중클러스터"] = shortCandles;
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.length).toBe(0);
    expect((res.qualification.drops.no_verdict ?? 0) + (res.qualification.drops.insufficient_candles ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("신선도: 어제와 같은 종목·같은 신호 시작이면 제외", async () => {
    const s = baseScenario();
    const priorKeys = new Set<string>(["조용외인#2026-07-17"]); // 4일 streak 시작일
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s), priorPickKeys: priorKeys });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("조용외인");
    expect(res.qualification.drops.stale_repeat).toBeGreaterThanOrEqual(1);
  });
});
