/**
 * 여섯 탭 조립본 견본 (UI-FIX A-2 · PART D).
 *
 * **정규 도메인 실측(2026-09-25 04:06 조립본)에서 옮겼다.** 텍스트 예산 테스트와 390px 캡처가
 * 같이 쓴다. 숫자를 지어내지 않으려고 트랙 값·자본 곡선·고래·연구는 API 응답 그대로다.
 *
 * 예외 하나 — 실측에 없는 것이라 **만든 값**이다(포지션은 UI-06 에서 실측으로 바꿨다 — `positions.json`):
 *
 * | | 왜 |
 * |---|---|
 * | 거래 원장 | 조립본에는 일별 자본만 있다. 그날 자본 변화를 거래 N 건으로 나눠 되만든다 — 곡선 끝은 실측과 같다 |
 *
 * 조립은 **실제 빌더**(`buildOverview` · `buildStrategies` · `buildPortfolio`)를 지난다.
 * 화면이 받는 모양이 서버와 어긋나면 여기서 타입이 깨진다.
 */
import { LIQUIDATION_PCT, type FcePositionRow, type FceTrackRow, type FceWhaleView } from "../../lib/lab/fce-board";
import type { WhaleBoard } from "../../lib/lab/fce-payload";
import { buildWhales } from "../../lib/lab/whales";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseNote } from "../../lib/lab/research-note";
import { buildJournal, journalDetail, type JournalTrade } from "../../lib/lab/journal";
import type { PostExit, TradeDetail } from "../../lib/lab/journal-extra";
import { buildResearch } from "../../lib/lab/research";
import positionsFixture from "./positions.json";
import journalFixture from "./journal.json";
import whaleFixture from "./whale.json";
import {
  buildOverview,
  populationOf,
  type Bar,
  type LostDay,
  type TradeLite,
} from "../../lib/lab/overview";
import { buildPortfolio } from "../../lib/lab/portfolio";
import { buildCharts, buildPositions, type PositionDetail } from "../../lib/lab/positions";
import { buildStrategies } from "../../lib/lab/strategies";
import type { Jsonify, Wire } from "../../lib/lab/wire";

export const NOW = new Date("2026-09-25T04:06:46Z");
const DAY = 86_400_000;

function track(over: Partial<FceTrackRow> & Pick<FceTrackRow, "key" | "label">): FceTrackRow {
  return {
    currency: "USDT",
    startingCapital: 500,
    currentCapital: 500,
    realized: null,
    unrealized: null,
    returnPct: 0,
    trades: null,
    winRatePct: null,
    profitFactor: null,
    mddPct: null,
    sampleNote: null,
    status: "running",
    statusReason: null,
    evidenceNote: null,
    elapsedDays: null,
    calendarDays: null,
    validationFrom: null,
    leverage: null,
    benchmarkLabel: null,
    benchmarkReturnPct: null,
    asOf: NOW,
    ...over,
  };
}

/** `/api/lab/strategies` → `portfolio.tracks` 실측. */
export const TRACKS: FceTrackRow[] = [
  track({
    key: "crypto",
    label: "크립토",
    // FCE `/api/paper/dashboard` 2026-09-27 02:52 — 원장(`journal.json`)과 같은 시각.
    currentCapital: 364.9352,
    returnPct: -27.013,
    trades: 165,
    winRatePct: 53.33,
    profitFactor: 0.6585,
    mddPct: 36.8944,
    leverage: 3,
    benchmarkLabel: "BTC 보유",
    validationFrom: new Date("2026-07-17T05:46:20.457Z"),
  }),
  track({
    key: "whale",
    label: "고래 추종",
    // FCE 추종 버킷 2026-09-27 — 94건 · 승률 36.2% · PF 0.647. FCE 가 MDD 를 내지 않는다.
    currentCapital: 470.2184,
    returnPct: -5.95632,
    trades: 94,
    winRatePct: 36.2,
    profitFactor: 0.647,
    sampleNote: "추종 트랙 성적 — 고래 자신의 승률과 다른 모집단",
  }),
  track({
    key: "stock_us",
    label: "주식 US",
    currency: "USD",
    startingCapital: 100_000,
    currentCapital: 100_003.8171,
    returnPct: 0.0038,
    trades: 3,
    status: "stopped",
    statusReason: "체결 invariant — fill_price_outside_observed_range",
    evidenceNote: "체결가는 세션 시가에서 만들고 invariant 는 현재 분봉으로 검사한다.",
    elapsedDays: 2,
    calendarDays: 52,
    benchmarkLabel: "NASDAQ100",
    benchmarkReturnPct: 4.7927,
  }),
  track({
    key: "stock_kr",
    label: "주식 KR",
    currency: "KRW",
    startingCapital: 100_000_000,
    currentCapital: 99_999_339.85,
    returnPct: -0.0007,
    trades: 0,
    status: "held",
    statusReason: "봉 불일치 정지 예방 · 대기 주문 13,940건",
    elapsedDays: 3,
    calendarDays: 51,
    benchmarkLabel: "KOSPI100",
    benchmarkReturnPct: 0.8095,
  }),
  track({
    key: "polymarket",
    label: "폴리마켓",
    currency: "USDC",
    startingCapital: 10_000,
    currentCapital: 10_000,
    returnPct: 0,
    status: "excluded",
    statusReason: "451 지역 차단 · 평가 불가 보유 8건 → NAV 미산출",
  }),
];

/** 일별 실현 자본 실측 (`series[].points[].capital`) — 07-12 부터. */
const CRYPTO_DAILY = [
  500, 500.92, 500.92, 500.92, 500.92, 496.46, 499.68, 510.5, 515.87, 513.44, 513.44, 514.63, 514.63, 514.63,
  514.63, 514.63, 514.63, 514.97, 514.97, 514.97, 514.97, 514.97, 514.97, 514.97, 525.62, 526.9, 463.19, 465.63,
  465.63, 465.63, 462.07, 449.88, 457.8, 445.28, 449.61, 453.65, 453.86, 452.71, 447.97, 461.09, 447.47, 453.35,
  457.69, 456.69, 448.65, 446.91, 444.71, 429.83, 425.97, 425.97, 420.86, 424.46, 417.45, 426.08, 426.08, 413.18,
  405.91, 404.59, 395.07, 391.72, 382.48, 389.1, 389.1, 389.1, 366.62, 365.71, 369.29, 351.38, 348.68, 342.43,
  342.43, 356.04, 356.25, 351.83, 354.38, 356.64,
];
/** 같은 날 BTC 보유(500 으로 환산) 실측. BTC 가격 대용. */
const BTC_DAILY = [
  500, 488.67, 509.91, 507.65, 500.39, 501.19, 508.26, 507.39, 511.57, 521.76, 518.3, 510.34, 502.82, 504.66,
  512.7, 499.81, 501.06, 501.6, 507.84, 493.01, 492.5, 498.35, 497.96, 502.56, 506.94, 504.26, 508.96, 509.27,
  508.79, 501.49, 498.59, 497.65, 497.73, 494.23, 494.56, 493.1, 505.9, 507.41, 543.55, 572.48, 614.13, 604.22,
  609.39, 619.26, 615.7, 619.5, 629.11, 610.27, 613.28, 608.98, 616.03, 607.08, 606.3, 637.11, 624.5, 625.84,
  629.84, 620.19, 615.05, 613.88, 600.26, 605.41, 605.82, 602.4, 612.96, 593.01, 597.41, 599.07, 634.08, 636.96,
  636.39, 679.05, 675.83, 661.63, 661.73,
];
/** 08-24 부터. */
const WHALE_DAILY = [
  500, 498.46, 494.25, 491.05, 487.58, 487.43, 487.43, 487.43, 488.71, 488.71, 486.08, 485.19, 485.19, 485.72,
  486.06, 484.01, 484.95, 481.75, 472.15, 472.15, 472.15, 471.54, 463.79, 463.79, 465.12, 465.12, 467.03, 463.61,
  467.07, 470.72, 469.98, 471.37,
];

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "ADAUSDT", "LINKUSDT", "BNBUSDT", "RKLBUSDT", "MRVLUSDT", "XRPUSDT"];

/**
 * 일별 자본 변화를 거래로 되만든다. 거래 수는 실측 원장 수(크립토 162 · 고래 87)에 맞춰
 * 변화가 있던 날에 고르게 나눈다. **곡선 끝은 실측 자본과 같다.**
 */
function tradesFrom(key: string, start: string, daily: number[], total: number): TradeLite[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const days = daily
    .map((v, i) => ({ i, delta: i === 0 ? 0 : v - (daily[i - 1] as number) }))
    .filter((d) => Math.abs(d.delta) > 1e-9);
  const out: TradeLite[] = [];
  days.forEach((d, n) => {
    const k = Math.floor((total * (n + 1)) / days.length) - Math.floor((total * n) / days.length);
    // 하루 안에서 이긴 거래·진 거래가 섞이게 하고, 마지막 거래가 나머지를 받아 **그날 합 = 실측 변화**.
    const swing = Math.abs(d.delta) + 2;
    let sum = 0;
    for (let j = 0; j < k; j += 1) {
      const pnl = j === k - 1 ? d.delta - sum : j % 2 === 0 ? swing : -swing;
      sum += pnl;
      const exitAt = new Date(t0 + d.i * DAY - (k - j) * 3_600_000);
      out.push({
        trackKey: key,
        symbol: SYMBOLS[(n + j) % SYMBOLS.length] as string,
        direction: j % 3 === 0 ? "short" : "long",
        // 보유 시간 · 청산 사유도 만든 값이다 — 실측 원장 배수(전부 3배)만 사실이다.
        entryAt: new Date(exitAt.getTime() - (8 + (j % 5) * 4) * 3_600_000),
        exitAt,
        netPnlUsdt: pnl,
        netReturnPct: pnl,
        leverage: 3,
        exitReason: ["take_profit_2", "invalidation_breach", "time_decay"][j % 3] ?? null,
      });
    }
  });
  return out;
}

/**
 * 닫힌 거래 — **FCE 원장 실측**(2026-09-27 업로드 페이로드 · 264건, `journal.json`). 전에는 일별 자본에서
 * 되만든 거래였다(`tradesFrom`) — 복기가 거래 한 건 한 건을 보게 되면서(UI-09) 실측으로 바꿨다.
 */
export const TRADES: (TradeLite & JournalTrade)[] = journalFixture.trades.map((t) => ({
  ...(t as unknown as Omit<JournalTrade, "entryAt" | "exitAt">),
  entryAt: t.entryAt ? new Date(t.entryAt) : null,
  exitAt: t.exitAt ? new Date(t.exitAt) : null,
}));
void tradesFrom;

/** BTC H1 — 일별 실측을 시간 단위로 잇는다. */
export const BTC: Bar[] = (() => {
  const t0 = Date.parse("2026-07-12T00:00:00Z");
  const out: Bar[] = [];
  for (let i = 0; i < BTC_DAILY.length; i += 1) {
    const a = BTC_DAILY[i] as number;
    const b = (BTC_DAILY[i + 1] ?? a) as number;
    for (let h = 0; h < 24; h += 1) {
      const at = t0 + i * DAY + h * 3_600_000;
      if (at > NOW.getTime()) break;
      out.push({ at: new Date(at), close: a + ((b - a) * h) / 24 });
    }
  }
  return out;
})();

/** 크립토 관측 유실일 49일 — 실측 개수. 날짜는 호스트가 자던 주말·밤을 흉내 낸 배치다. */
export const LOST_DAYS: LostDay[] = Array.from({ length: 75 }, (_, i) => i)
  .filter((i) => i % 3 !== 0 || i % 2 === 0)
  .slice(0, 49)
  .map((i) => ({
    trackKey: "crypto",
    day: new Date(Date.parse("2026-07-12T00:00:00Z") + i * DAY).toISOString().slice(0, 10),
    coveragePct: 40 + (i % 5) * 9,
    reason: "host_sleep",
  }));

/**
 * 열린 페이퍼 포지션 다섯 — **FCE `/api/paper/dashboard` 실측(2026-09-26 11:30 UTC)을 실제 매퍼
 * (`positionFromOpenTrade`)로 옮긴 것**과 Bitget 공개 캔들(시간봉마다 60개). `positions.json`.
 */
export const POSITIONS_AT = new Date(positionsFixture.at);
export const POSITIONS: FcePositionRow[] = positionsFixture.positions.map((p) => ({
  ...(p as unknown as Omit<FcePositionRow, "entryAt" | "liquidationLevel">),
  entryAt: p.entryAt ? new Date(p.entryAt) : null,
  liquidationLevel: p.netReturnPct !== null && p.netReturnPct <= LIQUIDATION_PCT,
}));
export const CHARTS = positionsFixture.charts as { symbol: string; timeframe: "15m" | "1h" | "4h" | "1d"; candles: [number, number, number, number, number][] }[];

/**
 * 연구 노트 일곱 — **레포의 실제 파일**(`docs/lab/research/*.md`)을 시드와 같은 파서로 읽는다.
 * 파일을 고치면 견본도 같이 바뀐다 — 화면 테스트가 옛 문구를 붙들고 있지 않게.
 */
const RESEARCH_DIR = join(__dirname, "../../../../docs/lab/research");
export const NOTES = readdirSync(RESEARCH_DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .sort()
  .map((f) => parseNote(readFileSync(join(RESEARCH_DIR, f), "utf8"), f));
export const RESEARCH = NOTES.map((n) => ({
  no: n.no,
  trackKeys: n.trackKeys,
  title: n.title,
  blocks: n.blocks,
  status: n.status,
  summary: n.summary,
  verdict: n.verdict,
}));

/** 연구 상세 한 건 — DB `Research` 행 모양(시드가 쓰는 그대로). */
function detailItem(no: string) {
  const n = NOTES.find((x) => x.no === no) as (typeof NOTES)[number];
  return {
    no: n.no, title: n.title, status: n.status, verdict: n.verdict, summary: n.summary,
    hypothesis: n.hypothesis, method: n.method, why: n.why, hypotheses: n.hypotheses, methods: n.methods,
    findings: n.findings, related: n.related, liveGate: n.liveGate, evidence: n.evidence, decision: n.decision,
    blocks: n.blocks, openedAt: n.openedAt, closedAt: n.closedAt, trackKeys: n.trackKeys, updatedAt: NOW,
  };
}

/** JSON 을 한 번 지난 모양 — 화면이 받는 그대로. */
const wire = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;

export function fixtures() {
  const overviewCore = buildOverview({
    tracks: TRACKS,
    trades: TRADES,
    positions: POSITIONS,
    btc: BTC,
    lostDays: LOST_DAYS,
    research: RESEARCH,
    now: NOW,
  });
  const overview = { ...overviewCore, positions: POSITIONS.length };
  const core = buildStrategies({
    tracks: TRACKS,
    overview: overviewCore,
    trades: TRADES,
    research: RESEARCH,
    // `Strategy` 실측(2026-09-22 폐기) · 마지막 백테스트 성적은 BACKTEST_LOG 09-19.
    archive: [
      { name: "추세 스윙", version: 1, stoppedAt: new Date("2026-09-22T03:00:00Z"), trades: 80, cagrMdd: 0.3 },
      { name: "평균회귀", version: 1, stoppedAt: new Date("2026-09-22T03:00:00Z"), trades: 388, cagrMdd: 0.15 },
      { name: "고래 추종", version: 1, stoppedAt: new Date("2026-09-22T03:00:00Z"), trades: 0, cagrMdd: null },
    ],
    wallets: 2,
    now: NOW,
  });


  const positionsCore = buildPositions({
    positions: POSITIONS,
    trackLabels: Object.fromEntries(TRACKS.map((t) => [t.key, t.label])),
    research: RESEARCH.map((r) => ({ ...r, blocks: r.blocks })),
    lastAt: POSITIONS_AT,
  });
  const journalExtra = {
    details: journalFixture.details as unknown as Record<string, TradeDetail>,
    postExit: journalFixture.postExit as unknown as Record<string, PostExit | null>,
  };
  const journalCore = buildJournal({
    trades: TRADES,
    open: POSITIONS.map((p) => ({ id: p.id, trackKey: p.trackKey, symbol: p.symbol, direction: p.direction, leverage: p.leverage, entryAt: p.entryAt, netReturnPct: p.netReturnPct })),
    extra: journalExtra,
    trackLabels: Object.fromEntries(TRACKS.map((t) => [t.key, t.label])),
    population: populationOf(TRACKS),
  });
  const charts = buildCharts(CHARTS.map((c) => ({ ...c, asOf: POSITIONS_AT })));
  const detailOf = (id: string): PositionDetail => {
    const position = positionsCore.positions.find((x) => x.id === id) as PositionDetail["position"];
    return {
      position,
      chart: charts.bySymbol[position.symbol] ?? {},
      chartAsOf: charts.asOf,
      caveat: positionsCore.caveat,
      liveOnly: positionsCore.liveOnly,
      lastAt: POSITIONS_AT,
    };
  };

  return {
    overview: wire<Wire<"overview">>(overview),
    strategies: wire<Wire<"strategies">>({
      ...core,
      portfolio: buildPortfolio(TRACKS),
      series: [],
    }),
    positions: wire<Wire<"positions">>(positionsCore),
    /** `GET /api/lab/positions/{id}` — 위험 순 첫 포지션. */
    positionDetail: wire<Jsonify<PositionDetail>>(detailOf(positionsCore.positions[0]?.id ?? "")),
    charts: wire<Wire<"charts">>(charts),
    journal: wire<Wire<"journal">>(journalCore),
    /** `GET /api/lab/journal/{id}` — 크립토 손절 · 크립토 익절 · 고래 한 건씩(실측). */
    journalDetails: journalFixture.detailIds.map((id) =>
      wire<Jsonify<ReturnType<typeof journalDetail>>>(
        journalDetail(journalCore.rows.find((r) => r.id === id) as (typeof journalCore.rows)[number], journalExtra)
      )
    ),
    whales: wire<Wire<"whales">>(
      buildWhales({
        whale: {
          ...(whaleFixture as unknown as Omit<FceWhaleView, "asOf" | "board">),
          board: whaleFixture.board as unknown as WhaleBoard,
          asOf: new Date(whaleFixture.asOf),
        },
        research: RESEARCH.map((r) => ({ ...r })),
        followAvgHoldHours: core.rows.find((r) => r.key === "whale")?.avgHoldHours ?? null,
      })
    ),
    research: wire<Wire<"research">>(
      buildResearch({
        items: NOTES.map((n) => ({
          no: n.no,
          title: n.title,
          status: n.status,
          verdict: n.verdict,
          summary: n.summary,
          decision: n.decision,
          blocks: n.blocks,
          liveGate: n.liveGate,
          openedAt: n.openedAt,
          closedAt: n.closedAt,
          trackKeys: n.trackKeys,
        })),
        strategies: { beatCount: core.beatCount, measuredCount: core.measuredCount },
        now: NOW,
      })
    ),
    /** `GET /api/lab/research/01` 의 `item` — 상세 견본. */
    researchDetail: wire<Record<string, unknown>>(detailItem("01")),
  };
}
