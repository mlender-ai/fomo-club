import { describe, expect, it } from "vitest";
import type {
  StockDef,
  InvestorFlow,
  CardVerdict,
  WyckoffAnalysis,
  CompanyScoreResult,
  DailyOhlcv,
} from "@fomo/core";
import { buildQuietPickResponse, formatShares, type QuietPickDeps, type KrMarketRow } from "../../lib/quiet-pick";
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

function candlesVol(volume: number, count = 260): DailyOhlcv[] {
  const out: DailyOhlcv[] = [];
  for (let i = 0; i < count; i += 1) {
    const day = new Date(Date.UTC(2025, 6, 1) + i * 86_400_000);
    out.push({ date: day.toISOString().slice(0, 10).replace(/-/g, ""), open: 1000, high: 1010, low: 990, close: 1000, volume });
  }
  return out;
}

function candles(): DailyOhlcv[] {
  return candlesVol(100_000);
}

/** 52주 저점에서 멀고 거래량이 평탄한 시리즈 — near_low·vacuum 이례성을 의도적으로 비활성. */
function candlesNoAnomaly(volume = 100_000_000): DailyOhlcv[] {
  return Array.from({ length: 260 }, (_, i) => {
    const day = new Date(Date.UTC(2025, 6, 1) + i * 86_400_000);
    const close = i < 40 ? 300 : 1000; // 초반 저점 300 → 현재 1000(저점 대비 +233%)
    return { date: day.toISOString().slice(0, 10).replace(/-/g, ""), open: close, high: close + 10, low: close - 10, close, volume };
  });
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
  priorBuys?: number;
  usRows?: KrMarketRow[];
  rankMap?: Record<string, { market: string; rank: number }>;
  dartInsiders?: Record<string, unknown>;
}

function depsFrom(s: Scenario): Partial<QuietPickDeps> {
  return {
    vocab: VOCAB,
    readSupplyDemandHistoryByTickers: async () => s.histories,
    computeStockAttentionSignals: async () => s.attention,
    fetchKrMarketRows: async () => s.marketRows,
    fetchInsiderClusterCandidates: async () => s.insiders,
    fetchInsiderPriorBuys: async () => s.priorBuys ?? 2,
    fetchCachedUsMarketRows: async () => s.usRows ?? [],
    fetchMarketCapRankMap: async () => (s.rankMap ?? {}) as Awaited<ReturnType<QuietPickDeps["fetchMarketCapRankMap"]>>,
    assembleStockFront: async (stock: string) => s.fronts[stock] ?? frontFor("1,000원", 1),
    // 봉인은 DB 라 테스트에서는 주입된 길이를 그대로 돌려준다(병합 없음).
    writeUsCandleCache: async (_symbol: string, candles: readonly DailyOhlcv[]) => candles.length,
    fetchDartInsiderPurchasesByStock: async () =>
      (s.dartInsiders ?? {}) as Awaited<ReturnType<QuietPickDeps["fetchDartInsiderPurchasesByStock"]>>,
  };
}

const usRow = (symbol: string, marketCapUsd: number): KrMarketRow =>
  ({ canonical: symbol, symbol, changePct: 1, marketCapUsd } as unknown as KrMarketRow);

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
    expect(pick.signal.actors).toBe("임원 3명");
    expect(pick.signal.scale).toBe("$4.6M");
    // 훅은 **무슨 일이 일어났나 한 문장**이고, 이례성은 칩으로 내려간다(WO-SUB-HOOK PART 1).
    expect(pick.anomalies.length).toBeGreaterThanOrEqual(1);
    expect(pick.hook).toContain("임원 3명");
    expect(pick.hook).not.toContain("—");
    expect(pick.chips.length).toBeGreaterThan(0);
    expect(/\d/.test(pick.hook)).toBe(true);
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
    const shortCandles: StockFrontData = { ...frontFor("1,010원", 1), candles: candlesVol(100_000, 60) };
    s.fronts["조용외인"] = noVerdict;
    s.fronts["다중클러스터"] = shortCandles;
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.length).toBe(0);
    expect((res.qualification.drops.no_verdict ?? 0) + (res.qualification.drops.insufficient_candles ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("무효선 레벨이 0 이하면 탈락 ('0원 이탈' 무의미 문구 방지)", async () => {
    const s = baseScenario();
    const badInval: StockFrontData = {
      ...frontFor("1,010원", 1),
      verdict: { ...verdict(), invalidationLevel: 0, invalidation: "52주 저점 0원 이탈" },
    };
    s.fronts["조용외인"] = badInval;
    s.fronts["다중클러스터"] = badInval;
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.length).toBe(0);
    expect(res.qualification.drops.no_invalidation).toBeGreaterThanOrEqual(2);
  });

  it("US: front.signals.changePct 결측이어도 insider quote 등락률로 급등 컷", async () => {
    const s = baseScenario();
    s.attention["Hot Inc"] = quietAttention(5);
    s.insiders = [
      { symbol: "HOT", companyName: "Hot Inc", insiderCount: 3, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 4_600_000, buyPrice: 50, quote: { price: 60, changePct: 20 } },
    ];
    const { signals: _drop, ...noChange } = frontFor("$60", 1);
    s.fronts["Hot Inc"] = { ...noChange, signals: {} };
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("Hot Inc");
    expect(res.qualification.drops.changed_15).toBeGreaterThanOrEqual(1);
  });

  it("신선도: 순수 반복은 제외가 아니라 강등이다 (WO-DECK-01 §3)", async () => {
    const s = baseScenario();
    // 어제 픽과 같은 신호(변화 0). 예전에는 `stale_repeat` 로 **제외**했지만, 연속 신호는 매일
    // 하루씩 늘어 이 컷에 걸리지 않았고(실측 일평균 0.4건) 결과적으로 재노출 제어가 없었다.
    // 이제 순수 반복은 남되 신규성 감쇠·1페이지 쿨다운이 순위로 누른다 — 강등이지 제외가 아니다.
    const priorPicks = new Map([["조용외인", { startedAt: "2026-07-17", days: 4, scale: "12만주" }]]);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s), priorPicks });
    expect(res.picks.map((p) => p.subject.canonical)).toContain("조용외인");
    expect(res.qualification.drops.repeat_demoted).toBeGreaterThanOrEqual(1);
    // "어제보다 1일 더 이어졌어요" 는 재등장 사유가 아니므로 진행 문구가 붙지 않는다.
    const repeated = res.picks.find((p) => p.subject.canonical === "조용외인");
    expect(repeated?.signal.progress).toBeUndefined();
  });

  it("1페이지 쿨다운: 연속 점유일수가 길수록 순위 점수가 낮아진다", async () => {
    const s = baseScenario();
    const clean = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    const penalized = await buildQuietPickResponse({
      date: TODAY,
      deps: depsFrom(s),
      page1Streaks: new Map([["조용외인", 7]]),
    });
    const before = clean.picks.find((p) => p.subject.canonical === "조용외인")?.signal.rankScore;
    const after = penalized.picks.find((p) => p.subject.canonical === "조용외인")?.signal.rankScore;
    expect(before).toBeGreaterThan(0);
    expect(after).toBeCloseTo(before! * 0.25, 6);
  });

  it("경과일 상한 초과는 픽이 아니라 워치다 (영구 배제 아님)", async () => {
    const s = baseScenario();
    // 창을 전부 순매수로 채워 연속일수를 상한 위로 올린다.
    // store 는 **최신순**이므로 내림차순으로 넣어야 `startedAt` 이 가장 오래된 날이 된다.
    const dayBefore = (offset: number): string =>
      new Date(Date.UTC(2026, 6, 19) - offset * 86_400_000).toISOString().slice(0, 10);
    s.histories["111111"] = Array.from({ length: 30 }, (_, i) => ({
      date: dayBefore(i),
      foreignNet: 1_000,
      institutionNet: -1_000,
      individualNet: 0,
    })) as typeof s.histories["111111"];
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    const aged = res.watching.find((w) => w.subject.canonical === "조용외인");
    expect(aged?.reasonCode).toBe("signal_aged");
    expect(aged?.reasonText).toMatch(/지났어요/);
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("조용외인");
    expect(res.rotation?.agedOut).toBeGreaterThanOrEqual(1);
  });
});

describe("buildQuietPickResponse — 이례성·시총 상한(WO-G1A2)", () => {
  it("전 픽에 이례성 지표 ≥1 + 훅은 한 문장 · 근거는 칩으로", async () => {
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(baseScenario()) });
    expect(res.picks.length).toBeGreaterThan(0);
    for (const p of res.picks) {
      expect(p.anomalies.length).toBeGreaterThanOrEqual(1);
      // H1 — 절을 이어 붙이지 않는다.
      expect(p.hook).not.toContain("—");
      expect(p.hook).not.toContain(";");
      // 훅이 말하지 않는 근거는 칩이 받는다(서로 다른 축 최대 3개).
      expect(p.chips.length).toBeGreaterThan(0);
      expect(p.chips.length).toBeLessThanOrEqual(3);
      expect(new Set(p.chips).size).toBe(p.chips.length);
    }
  });

  it("이례성 지표가 하나도 없으면 발행 제외(no_anomaly)", async () => {
    const s = baseScenario();
    // 조용외인: 신호는 있으나 규모 미미(초대형 거래량)·화제 있음·streak 최장 아님 → 지표 0.
    s.histories["111111"] = [
      // 최신 3일 순매수 + 그 앞 6일 순매수(더 긴 과거 run) → 현재가 최장 아님.
      ...[20, 19, 18].map((d) => ({ date: `2026-07-${d}`, foreignNet: 30_000, institutionNet: -5_000 })),
      { date: "2026-07-17", foreignNet: -5_000, institutionNet: -5_000 },
      ...[16, 15, 14, 13, 12, 11].map((d) => ({ date: `2026-07-${d}`, foreignNet: 30_000, institutionNet: -5_000 })),
    ];
    s.attention["조용외인"] = quietAttention(40); // 화제 있음(뉴스 0 아님)
    s.fronts["조용외인"] = { ...frontFor("1,000원", 1), candles: candlesNoAnomaly(), signals: { changePct: 1, volumeRatio: 1.2, mentionCount: 40 } };
    // 다중클러스터도 제거해 픽 0 확인.
    s.histories["222222"] = flows(1, 1);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("조용외인");
    expect(res.qualification.drops.no_anomaly).toBeGreaterThanOrEqual(1);
  });

  it("US 대형주($50B 초과)는 조용함 게이트에서 컷", async () => {
    const s = baseScenario();
    s.attention["Elevance Health"] = quietAttention(5);
    s.insiders = [
      { symbol: "ELV", companyName: "Elevance Health", insiderCount: 2, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 1_400_000, buyPrice: 389, industry: "Insurance" },
    ];
    s.usRows = [usRow("ELV", 90_000_000_000)];
    s.fronts["Elevance Health"] = frontFor("$389", -1);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("Elevance Health");
    expect(res.qualification.drops.mega_cap).toBeGreaterThanOrEqual(1);
  });

  it("KR 시총 상위 100위 이내는 조용함 게이트에서 컷", async () => {
    const s = baseScenario();
    s.rankMap = { "111111": { market: "KOSDAQ", rank: 50 } };
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("조용외인");
    expect(res.qualification.drops.mega_cap).toBeGreaterThanOrEqual(1);
  });

  it("회사 정체 한 줄: 산업명 → 한국어 매핑(US)", async () => {
    const s = baseScenario();
    s.attention["Small Bank Corp"] = quietAttention(5);
    s.insiders = [
      { symbol: "SBC", companyName: "Small Bank Corp", insiderCount: 5, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 2_000_000, buyPrice: 20, industry: "Savings Institutions" },
    ];
    s.fronts["Small Bank Corp"] = frontFor("$21", 1);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    const pick = res.picks.find((p) => p.subject.canonical === "Small Bank Corp");
    expect(pick?.subject.identity).toBe("은행");
  });
});

describe("buildQuietPickResponse — 데이터 완결성 게이트(WO-P1)", () => {
  /** CLBK 재현: 무료 소스에 이력이 3봉뿐인 재상장 종목. */
  function thinHistoryScenario(): Scenario {
    const s = baseScenario();
    s.attention["Relisted Corp"] = quietAttention(5);
    s.insiders = [
      { symbol: "RLST", companyName: "Relisted Corp", insiderCount: 16, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 4_800_000, buyPrice: 11, industry: "State Commercial Banks" },
    ];
    s.fronts["Relisted Corp"] = { ...frontFor("$11.01", -1), candles: candlesVol(100_000, 3) };
    return s;
  }

  it("캔들 200일 미확보 종목은 하이드레이션 후에도 탈락(빈 껍데기 픽 금지)", async () => {
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(thinHistoryScenario()) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("Relisted Corp");
    expect(res.qualification.drops.insufficient_candles).toBeGreaterThanOrEqual(1);
  });

  it("봉인 캐시가 긴 이력을 갖고 있으면 그 길이로 자격 판정(요청 경로가 재현 가능)", async () => {
    const s = thinHistoryScenario();
    const deps = {
      ...depsFrom(s),
      // 이전 픽에서 봉인해둔 250봉과 병합됐다고 가정.
      writeUsCandleCache: async () => 250,
    };
    const res = await buildQuietPickResponse({ date: TODAY, deps });
    const pick = res.picks.find((p) => p.subject.canonical === "Relisted Corp");
    expect(pick).toBeDefined();
    expect(pick!.dataQuality.candles).toBe(250);
    expect(pick!.dataQuality.sealedCandles).toBe(250);
  });

  /**
   * DS-05 §4 이후: 섹터는 **신뢰 소스가 있을 때만** 채운다. 매핑이 없으면 빈 문자열이고
   * `dataQuality.identity` 가 false 다 — 발행을 막지는 않는다(화면이 섹터 줄을 안 그린다).
   * 종전에는 `기타 업종`·`미국주식` 폴백으로 항상 true 였고, 그게 테마 라벨 오염과 같은 뿌리였다.
   */
  it("발행 픽 전원 dataQuality: 캔들 ≥200 · 티커 · 섹터는 있으면 한국어", async () => {
    const s = baseScenario();
    s.attention["Byrna Technologies Inc."] = quietAttention(5);
    s.insiders = [
      { symbol: "BYRN", companyName: "Byrna Technologies Inc.", insiderCount: 3, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 253_000, buyPrice: 3.3, industry: "Miscellaneous Electrical Machinery" },
    ];
    s.fronts["Byrna Technologies Inc."] = frontFor("$3.37", 4);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.length).toBeGreaterThan(0);
    for (const pick of res.picks) {
      expect(pick.dataQuality.candles).toBeGreaterThanOrEqual(200);
      // 섹터가 있으면 dataQuality 가 그렇다고 말한다(둘이 갈리면 감사 불가).
      expect(pick.dataQuality.identity).toBe(Boolean(pick.subject.identity));
      if (pick.subject.identity) {
        // 영문 원문 노출 금지 — 있을 때는 항상 한국어(잘린 "Miscellaneous Electrical" 재발 차단).
        expect(pick.subject.identity).toMatch(/[가-힣]/);
        expect(pick.subject.identity).not.toMatch(/[A-Za-z]{4,}/);
      }
      if (pick.subject.country === "US") expect(pick.dataQuality.ticker).toBe(true);
    }
  });
});

describe("buildQuietPickResponse — 게이트 재교정 + 2단 구조(WO-P4)", () => {
  it("유동성 3억~10억은 픽 + '거래가 얇아요' 표기(10억 컷은 자기모순이었다)", async () => {
    const s = baseScenario();
    s.marketRows = s.marketRows.map((row) =>
      row.naverCode === "111111" ? ({ ...row, tradingValue: 500_000_000 } as KrMarketRow) : row
    );
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    const pick = res.picks.find((p) => p.subject.canonical === "조용외인");
    expect(pick).toBeDefined();
    expect(pick!.liquidityNote).toContain("거래가 얇아요");
  });

  it("3억 미만은 픽 대신 '지켜보는 중'으로 — 사유를 유저어로 표기", async () => {
    const s = baseScenario();
    s.marketRows = s.marketRows.map((row) =>
      row.naverCode === "111111" ? ({ ...row, tradingValue: 120_000_000 } as KrMarketRow) : row
    );
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("조용외인");
    const watch = res.watching.find((w) => w.subject.canonical === "조용외인");
    expect(watch?.reasonCode).toBe("illiquid");
    expect(watch?.reasonText).toContain("거래가 너무 얇아요");
    expect(watch?.reasonText).toMatch(/\d/); // 수치까지 표기
  });

  it("US 대형주 조건부: 소액 2명(Elevance급)은 지켜보는 중, 내부자 5명+는 픽", async () => {
    const base = baseScenario();
    base.attention["Elevance Health"] = quietAttention(5);
    base.attention["MegaCap Insiders"] = quietAttention(5);
    base.insiders = [
      { symbol: "ELV", companyName: "Elevance Health", insiderCount: 2, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 1_400_000, buyPrice: 389, industry: "Insurance" },
      { symbol: "MEGA", companyName: "MegaCap Insiders", insiderCount: 6, tradeDate: "2026-07-18", filingDate: "2026-07-19", valueUsd: 3_000_000, buyPrice: 100, industry: "State Commercial Banks" },
    ];
    base.usRows = [usRow("ELV", 90_000_000_000), usRow("MEGA", 80_000_000_000)];
    base.fronts["Elevance Health"] = frontFor("$389", -1);
    base.fronts["MegaCap Insiders"] = frontFor("$100", 1);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(base) });
    expect(res.picks.map((p) => p.subject.canonical)).not.toContain("Elevance Health");
    expect(res.watching.find((w) => w.subject.canonical === "Elevance Health")?.reasonCode).toBe("mega_cap");
    // 임원진 대거 매수(6명)는 대형주라도 통과 — "대형주라 무조건 제외"가 아니다.
    expect(res.picks.map((p) => p.subject.canonical)).toContain("MegaCap Insiders");
  });

  it("신호 강화 시 재등장 — 'N일째 계속, 어제보다 …' 진행 문구", async () => {
    const s = baseScenario();
    // 어제는 3일째였고 오늘 4일째 → 강화.
    const priorPicks = new Map([["조용외인", { startedAt: "2026-07-17", days: 3, scale: "9만주" }]]);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s), priorPicks });
    const pick = res.picks.find((p) => p.subject.canonical === "조용외인");
    expect(pick).toBeDefined();
    expect(pick!.signal.progress).toContain("일째 계속");
  });

  it("DART 내부자 장내매수가 픽 후보로 올라온다(KR 내부자 신호 신설)", async () => {
    const s = baseScenario();
    s.histories["555555"] = flows(0, 0); // 수급 신호는 없는 종목
    s.dartInsiders = {
      무신호: {
        ticker: "무신호",
        label: "임원·주요주주가 3.2억원 규모 취득 신고",
        source: "DART 내부자 공시",
        asOf: "2026-07-19",
        insiderPurchase: { ownerRole: "임원·주요주주", shares: 40_000, price: 8_000, value: 320_000_000, transactionDate: "2026-07-19" },
      },
    };
    s.fronts["무신호"] = frontFor("1,000원", 1);
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    const pick = res.picks.find((p) => p.subject.canonical === "무신호");
    expect(pick).toBeDefined();
    expect(pick!.signal.code).toBe("insider_cluster");
    expect(pick!.signal.scale).toContain("억원");
  });

  it("지켜보는 중은 최대 10곳 · 품질 실패 후보는 선반에도 오르지 않는다", async () => {
    const s = baseScenario();
    // 품질 실패(캔들 부족) 후보를 화제성 초과로도 만들어 둔다 → 선반에 오르면 안 됨.
    s.attention["화제종목"] = quietAttention(95);
    s.fronts["화제종목"] = { ...frontFor("1,000원", 1), candles: candlesVol(100_000, 20) };
    const res = await buildQuietPickResponse({ date: TODAY, deps: depsFrom(s) });
    expect(res.watching.length).toBeLessThanOrEqual(10);
    expect(res.watching.map((w) => w.subject.canonical)).not.toContain("화제종목");
    expect(res.qualification.watching).toBe(res.watching.length);
  });
});

/**
 * WO-SUB-HOOK D9 · 4-3 — 주식수 표기 규칙 하나로 고정.
 * 74주(빅텍)와 47만주(한미반도체)가 같은 규칙의 두 구간이라는 것을 못박는다.
 */
describe("formatShares — 만 단위 경계", () => {
  it("1만주 미만은 낱주를 그대로 쓴다", () => {
    expect(formatShares(74)).toBe("74주");
    expect(formatShares(9_999)).toBe("9,999주");
  });

  it("1만주 이상은 만주로 반올림한다", () => {
    expect(formatShares(10_000)).toBe("1만주");
    expect(formatShares(470_000)).toBe("47만주");
  });

  it("부호·소수는 표기에 새지 않는다", () => {
    expect(formatShares(-74)).toBe("74주");
    expect(formatShares(73.6)).toBe("74주");
  });
});
