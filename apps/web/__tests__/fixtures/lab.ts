/**
 * 여섯 탭 조립본 견본 (UI-FIX A-2 · PART D).
 *
 * **정규 도메인 실측(2026-09-25 04:06 조립본)에서 옮겼다.** 텍스트 예산 테스트와 390px 캡처가
 * 같이 쓴다. 숫자를 지어내지 않으려고 트랙 값·자본 곡선·고래·연구는 API 응답 그대로다.
 *
 * 예외 둘 — 실측에 없는 것이라 **만든 값**이다:
 *
 * | | 왜 |
 * |---|---|
 * | 거래 원장 | 조립본에는 일별 자본만 있다. 그날 자본 변화를 거래 N 건으로 나눠 되만든다 — 곡선 끝은 실측과 같다 |
 * | 포지션 손익 | 실측은 B-2 버그 값(−0.27% 반복)이다. 고친 업로더가 올릴 현재가 손익은 Mac 러너가 돌아야 생긴다 |
 *
 * 조립은 **실제 빌더**(`buildOverview` · `buildStrategyRows` · `buildPortfolio`)를 지난다.
 * 화면이 받는 모양이 서버와 어긋나면 여기서 타입이 깨진다.
 */
import type { FcePositionRow, FceTrackRow } from "../../lib/lab/fce-board";
import {
  MIN_SAMPLE_RANK,
  buildOverview,
  buildStrategyRows,
  type Bar,
  type LostDay,
  type TradeLite,
} from "../../lib/lab/overview";
import { buildPortfolio } from "../../lib/lab/portfolio";
import type { Wire } from "../../lib/lab/wire";

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
    currentCapital: 356.6397,
    returnPct: -28.6721,
    trades: 157,
    winRatePct: 52.87,
    profitFactor: 0.6328,
    mddPct: 36.8944,
    leverage: 3,
    benchmarkLabel: "BTC 보유",
  }),
  track({
    key: "whale",
    label: "고래 추종",
    currentCapital: 471.37,
    returnPct: -5.726,
    trades: 87,
    winRatePct: 36.8,
    profitFactor: 0.652,
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
      out.push({
        trackKey: key,
        symbol: SYMBOLS[(n + j) % SYMBOLS.length] as string,
        direction: j % 3 === 0 ? "short" : "long",
        exitAt: new Date(t0 + d.i * DAY - (k - j) * 3_600_000),
        netPnlUsdt: pnl,
        netReturnPct: pnl,
      });
    }
  });
  return out;
}

export const TRADES: TradeLite[] = [
  ...tradesFrom("crypto", "2026-07-12", CRYPTO_DAILY, 162),
  ...tradesFrom("whale", "2026-08-24", WHALE_DAILY, 87),
];

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

/** 실측 보유 넷 — **손익은 예시다**(위 머리말). 실측은 −0.27 · −0.27 · +1.71 · +2.52 였다. */
export const POSITIONS: FcePositionRow[] = [
  { id: "044bd33f", symbol: "XRPUSDT", direction: "long", leverage: 3, marginUsdt: 25.08, netReturnPct: -1.93, healthScore: null, entryAt: new Date("2026-09-24T16:00:00Z"), liquidationLevel: false },
  { id: "9ba6f713", symbol: "MRVLUSDT", direction: "long", leverage: 3, marginUsdt: 42.06, netReturnPct: 1.14, healthScore: null, entryAt: new Date("2026-09-23T04:00:00Z"), liquidationLevel: false },
  { id: "9166083a", symbol: "BNBUSDT", direction: "long", leverage: 3, marginUsdt: 59.11, netReturnPct: 1.71, healthScore: null, entryAt: new Date("2026-09-23T20:00:00Z"), liquidationLevel: false },
  { id: "e6931e94", symbol: "BABAUSDT", direction: "short", leverage: 3, marginUsdt: 65.09, netReturnPct: 2.52, healthScore: null, entryAt: new Date("2026-09-23T08:00:00Z"), liquidationLevel: false },
];

/** `/api/lab/research` 실측(01 요약은 이번에 고친 문구). */
export const RESEARCH = [
  { no: "01", title: "고래는 65.8% 맞히는데 우리는 왜 32.4%인가", blocks: null, status: "open", summary: "두 승률은 서로 다른 질문의 답 — 빼는 수가 아니다", verdict: null },
  { no: "02", title: "강제청산을 넣으면 성과가 얼마나 바뀌나", blocks: "실매매", status: "blocked", summary: "3배라 −100% 아래 거래 0건 — 배수를 올리면 드러난다", verdict: null },
  { no: "03", title: "호스트가 자는 동안 잃은 날은 며칠인가", blocks: null, status: "open", summary: "크립토 78일 중 29일만 유효 · 49일 유실", verdict: null },
  { no: "04", title: "추세·평균회귀 진입에 우위가 있나", blocks: null, status: "closed", summary: "우연 확률 99% · 기준선 넘은 전략 0개", verdict: "no" },
  { no: "05", title: "1배와 3배는 무엇이 다른가", blocks: null, status: "closed", summary: "147건 — 1배·3배 승률·PF 가 소수점까지 같다", verdict: "inconclusive" },
  { no: "06", title: "주식 US 체결 가격 이상은 왜 생기나", blocks: null, status: "open", summary: "봉 불일치 하나가 US 정지·KR 보류를 같이 만든다", verdict: null },
  { no: "07", title: "FOMO Club 신호 8종에 청산 규칙을 붙이면 알파가 있나", blocks: null, status: "open", summary: "주식 유효일 2~3일 — 판정할 표본이 없다", verdict: null },
];

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
  const rows = buildStrategyRows(TRACKS, overviewCore);

  const closed = TRADES.filter((t) => t.exitAt);
  const net = closed.reduce((s, t) => s + (t.netPnlUsdt ?? 0), 0);
  const wins = closed.filter((t) => (t.netPnlUsdt ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.netPnlUsdt ?? 0) < 0).length;
  // 비용 비율은 실측(87.7%)을 따른다 — 되만든 원장에는 비용 칸이 없다.
  const costs = 80.37;
  const gross = net + costs;

  const measurable = POSITIONS.filter((p) => p.netReturnPct !== null && p.marginUsdt !== null);

  return {
    overview: wire<Wire<"overview">>(overview),
    strategies: wire<Wire<"strategies">>({
      rows,
      beatCount: overviewCore.competition.beaten,
      measuredCount: overviewCore.competition.measured,
      rankableCount: rows.filter((r) => r.ranked).length,
      minSample: MIN_SAMPLE_RANK,
      portfolio: buildPortfolio(TRACKS),
      series: [],
    }),
    positions: wire<Wire<"positions">>({
      positions: POSITIONS,
      unrealizedUsdt: measurable.reduce((s, p) => s + ((p.marginUsdt ?? 0) * (p.netReturnPct ?? 0)) / 100, 0),
      measurable: measurable.length,
      total: POSITIONS.length,
      liquidationLevel: 0,
      caveat:
        "손익은 증거금 대비다. FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다 — 실제 거래소였으면 그 전에 증거금이 없어진다.",
    }),
    journal: wire<Wire<"journal">>({
      trades: [...closed]
        .sort((a, b) => (b.exitAt as Date).getTime() - (a.exitAt as Date).getTime())
        .slice(0, 60)
        .map((t, i) => ({
          id: `t${i}`,
          trackKey: t.trackKey,
          symbol: t.symbol,
          direction: t.direction,
          leverage: 3,
          entryAt: null,
          exitAt: t.exitAt,
          entryPrice: null,
          exitPrice: null,
          grossPnlUsdt: null,
          costsUsdt: 0.3,
          netPnlUsdt: t.netPnlUsdt,
          netReturnPct: t.netReturnPct,
          exitReason: (["take_profit_2", "invalidation_breach", "time_decay", "take_profit_pressure"] as const)[i % 4],
          lossTags: [],
          holdingBars: 30,
        })),
      total: {
        count: closed.length,
        wins,
        losses,
        flat: closed.length - wins - losses,
        grossUsdt: gross,
        costsUsdt: costs,
        netUsdt: net,
        costSharePct: (costs / Math.abs(gross)) * 100,
      },
      span: { from: closed[0]?.exitAt ?? null, to: NOW },
    }),
    whales: wire<Wire<"whales">>({
      whale: {
        walletsTotal: 82,
        eligible: 2,
        rejected: { excluded_type: 9, sample_below_min: 63, win_rate_below_min: 8 },
        passers: ["0x020ca66c30bec2c4fe3861a94e4db4a498a35872", "0x9546b9d4103be41ce13483a8f299d0df0eeb181c"],
        followWinPct: 36.8,
        followTrades: 87,
        followPf: 0.652,
        followNetUsdt: -28.63,
        latency: { median: 0.58, p90: 21.06, max: 29.9 },
        drift: { median: 0, p90: 7.14, max: 18.13 },
        asOf: NOW,
      },
      winRates: {
        whaleOwn: { value: 65.8, measures: "그 지갑의 온체인 체결 전부 — 고래의 자본·판단·출구" },
        ourFollow: { value: 36.8, trades: 87, measures: "우리가 따라 들어간 거래 — 우리 사이징·우리 출구" },
        subtractable: false,
        note: "다른 모집단이다. 이 차이는 한 축의 갭이 아니라 서로 다른 질문의 답 두 개다.",
      },
      causes: [
        { axis: "청산 규칙", measured: "고래 청산 따랐다면 −49.58 (75건)", detail: "고래 청산을 그대로 따랐다면 −49.58 USDT (75건)", verdict: "원인 아님 — 따라가면 더 나빴다", short: "원인 아님" },
        { axis: "진입 지연", measured: "중앙값 0.58분 · p90 21.06분", detail: "중앙값 0.58분 · p90 21.06분 · 최대 29.9분", verdict: "중앙값이 1분 안 — 약한 후보", short: "약한 후보" },
        { axis: "진입 가격 드리프트", measured: "중앙값 0% · p90 7.14%", detail: "중앙값 0% · p90 7.14% · 최대 18.13%", verdict: "손절폭 대비. p90 구간을 따로 볼 것", short: "p90 확인" },
        { axis: "사이징", measured: null, detail: null, verdict: "미측정", short: "미측정" },
        { axis: "지갑 선정", measured: null, detail: null, verdict: "미측정 — 리더보드에 재료 있음", short: "미측정" },
      ],
    }),
    research: wire<Wire<"research">>({
      items: RESEARCH.map((r) => ({
        ...r,
        openedAt: "2026-09-19T00:00:00.000Z",
        closedAt: r.status === "closed" ? "2026-09-22T00:00:00.000Z" : null,
        trackKeys: null,
      })),
      open: 4,
      blocked: 1,
      closed: 2,
      blockers: [{ no: "02", title: "강제청산을 넣으면 성과가 얼마나 바뀌나", blocks: "실매매" }],
    }),
  };
}
