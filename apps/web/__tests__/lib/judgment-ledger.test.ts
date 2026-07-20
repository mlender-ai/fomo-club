import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  finalSelections,
  buildDaily30LedgerEntries,
  daily30ResponseFromSelections,
  inferSignalTypes,
  ledgerKey,
  projectTimelineSignalTypes,
  scoreBand,
  userLedgerActor,
  type LedgerSelectionView,
} from "../../lib/judgment-ledger";
import { buildTrackRecord, type OutcomePayload } from "../../lib/ledger-track-record";
import { fetchHistoricalPrices } from "../../lib/quote-prices";
import { SIGNAL_TAXONOMY_VERSION, SIGNAL_TYPE_CODES } from "@fomo/core";

function selection(overrides: Partial<LedgerSelectionView> = {}): LedgerSelectionView {
  return {
    id: "selection-engine",
    date: "2026-07-20",
    ts: new Date("2026-07-20T00:00:00Z"),
    subject: { asset: "us-stock", canonical: "ACME", symbol: "ACME" },
    priceAt: 100,
    actor: "engine",
    payload: { signalTypes: ["insider_cluster"], companyScore: 82, scoreBand: "80-100" },
    ...overrides,
  };
}

describe("Judgment Ledger", () => {
  it("같은 날짜·대상의 엔진 선정은 위원회 승인으로 최종화한다", () => {
    const engine = selection();
    const committee = selection({
      id: "selection-committee",
      actor: "committee",
      ts: new Date("2026-07-20T01:00:00Z"),
    });
    expect(finalSelections([engine, committee])).toEqual([committee]);
    expect(finalSelections([{ ...engine, ts: new Date("2026-07-20T02:00:00Z") }, committee])).toEqual([committee]);
  });

  it("신호 유형과 점수대를 결정론적으로 분류한다", () => {
    expect(inferSignalTypes({
      headline: "내부자 3명 클러스터 매수와 공급계약",
      signals: { institutionNetStreak: 4, foreignNetStreak: 3 },
      companyScore: 82,
    })).toEqual([
      "insider_cluster",
      "institution_streak",
      "foreign_streak",
      "material_contract",
      "score_80_plus",
    ]);
    expect([scoreBand(90), scoreBand(70), scoreBand(40), scoreBand(null)]).toEqual([
      "80-100",
      "60-79",
      "0-59",
      undefined,
    ]);
  });

  it("레거시 타임라인 신호는 같은 선정 스냅샷의 표준 유형으로 보강한다", () => {
    expect(projectTimelineSignalTypes({
      types: ["chart", "herd"],
      headline: "클라우드 대표주",
    }, ["score_60_79"])).toEqual(["score_60_79"]);
    expect(projectTimelineSignalTypes({
      headline: "대형 공급계약 공시",
    }, ["score_80_plus"])).toEqual(["material_contract", "score_80_plus"]);
  });

  it("익명 식별자는 안정적으로 해시하고 원문 sessionId를 actor에 노출하지 않는다", () => {
    const actor = userLedgerActor({ sessionId: "raw-device-id" });
    expect(actor).toBe(userLedgerActor({ sessionId: "raw-device-id" }));
    expect(actor).not.toContain("raw-device-id");
    expect(ledgerKey("a", 1)).toHaveLength(64);
  });

  it("운영 SQL이 UPDATE와 DELETE를 트리거로 거부하고 RLS를 강제한다", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/sql/2026-07-20_judgment_ledger.sql"), "utf8");
    expect(sql).toContain("BEFORE UPDATE OR DELETE");
    expect(sql).toContain("JudgmentLedger is append-only");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE");
  });

  it("후보는 신호·판단·점수만, 최종 선정은 selection까지 모두 당시 가격으로 만든다", () => {
    const response = {
      stocks: [{ canonical: "ACME", symbol: "ACME", country: "US", market: "NASDAQ", sector: "AI", marquee: false, headline: "CEO Form 4 매수" }],
      fronts: {
        ACME: {
          priceText: "$123.45",
          axisSignals: [],
          verdict: { stance: "watch", stanceText: "구간 확인", evidence: [], confidence: "medium" },
          companyScore: { score: 82, label: "저평가", interpretation: "근거", axes: [], availableAxisCount: 1, omittedAxes: [] },
        },
      },
      meta: { cards: [{ id: "stock:US:ACME:ACME", assetClass: "us-stock", quietScore: 75, signalScore: 90, hypePenalty: 15 }], assetCounts: {}, targetCount: 1 },
    } as never;
    const candidates = buildDaily30LedgerEntries(response, "engine", { includeSelection: false, date: "2026-07-20" });
    const selected = buildDaily30LedgerEntries(response, "committee", { date: "2026-07-20" });
    expect(candidates.map((entry) => entry.kind)).toEqual(["signal", "verdict", "score"]);
    expect(selected.map((entry) => entry.kind)).toEqual(["signal", "verdict", "score", "selection"]);
    expect(selected.every((entry) => entry.priceAt === 123.45 && entry.actor === "committee")).toBe(true);
    expect(selected.find((entry) => entry.kind === "signal")?.payload).toMatchObject({
      taxonomyVersion: SIGNAL_TAXONOMY_VERSION,
      signalTypes: ["score_80_plus"],
    });
    const selectionEntry = selected.find((entry) => entry.kind === "selection")!;
    const restored = daily30ResponseFromSelections([selection({
      actor: "committee",
      payload: selectionEntry.payload as never,
      priceAt: selectionEntry.priceAt,
    })]);
    expect(restored?.stocks[0]?.canonical).toBe("ACME");
    expect(restored?.fronts.ACME?.priceText).toBe("$123.45");
    expect(restored?.meta.cards[0]?.quietScore).toBe(75);
  });
});

describe("track record fixed-window aggregation", () => {
  const base: OutcomePayload = {
    selectionId: "s1",
    selectionDate: "2026-06-01",
    windowDays: 30,
    evaluationDate: "2026-07-01",
    selectedPrice: 100,
    returnPct: 10,
    asset: "us-stock",
    signalTypes: ["insider_cluster", "institution_streak"],
    scoreBand: "80-100",
    companyScore: 84,
  };

  it("손실을 포함해 승률·중앙값·n을 전체와 분해축에 동일하게 계산한다", () => {
    const record = buildTrackRecord([
      base,
      { ...base, selectionId: "s2", returnPct: -4, asset: "kr-stock", signalTypes: ["institution_streak"], scoreBand: "60-79" },
      { ...base, selectionId: "s3", returnPct: 2, asset: "us-stock", signalTypes: ["insider_cluster"], scoreBand: "80-100" },
    ], "2026-07-20T00:00:00.000Z");
    const month = record.windows.find((window) => window.days === 30)!;
    expect(month.overall).toEqual({ n: 3, winRate: 66.7, medianReturn: 2 });
    expect(month.byAsset["us-stock"]).toEqual({ n: 2, winRate: 100, medianReturn: 6 });
    expect(month.bySignal.institution_streak).toEqual({ n: 2, winRate: null, medianReturn: null });
    expect(month.bySignal.insider_cluster).toEqual({ n: 2, winRate: null, medianReturn: null });
    expect(month.byScoreBand["80-100"]?.n).toBe(2);
  });

  it("7·30·90일 고정창을 항상 노출하고 표본이 없으면 null로 정직하게 표시한다", () => {
    const record = buildTrackRecord([]);
    expect(record.windows.map((window) => window.days)).toEqual([7, 30, 90]);
    expect(record.windows.every((window) => window.overall.n === 0 && window.overall.winRate === null)).toBe(true);
    expect(Object.keys(record.signalHistory30)).toHaveLength(SIGNAL_TYPE_CODES.length);
    expect(record.signalHistory30.insider_cluster).toEqual({ n: 0, winRate: null, medianReturn: null });
  });

  it("신호 승률은 30개 표본부터만 공개한다", () => {
    const outcomes = Array.from({ length: 30 }, (_, index): OutcomePayload => ({
      ...base,
      selectionId: `qualified-${index}`,
      returnPct: index < 21 ? 4 : -2,
      signalTypes: ["material_contract"],
    }));
    const metric = buildTrackRecord(outcomes).signalHistory30.material_contract;
    expect(metric).toEqual({ n: 30, winRate: 70, medianReturn: 4 });
  });

  it("선정 당시 박제된 캔들에서 목표일 또는 다음 거래일 종가를 먼저 사용한다", async () => {
    const prices = await fetchHistoricalPrices([{
      key: "selection-1:7",
      stock: "ACME",
      symbol: "ACME",
      country: "US",
      market: "NASDAQ",
      targetDate: "2026-07-12",
      candles: [
        { date: "20260710", open: 98, high: 101, low: 97, close: 100, volume: 10 },
        { date: "20260713", open: 101, high: 105, low: 100, close: 104, volume: 20 },
      ],
    }]);
    expect(prices.get("selection-1:7")).toEqual({ date: "2026-07-13", price: 104 });
  });
});
