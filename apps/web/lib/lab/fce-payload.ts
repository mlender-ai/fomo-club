/**
 * LAB-BRIDGE — 업로더와 인제스트가 **같이 보는 계약**.
 *
 * 한쪽만 고치면 조용히 어긋난다. 둘 다 이 파일을 import 한다.
 *
 * ## 원칙 — 계산하지 않는다
 *
 * 여기 오는 값은 전부 FCE 가 낸 것이다. 랩이 다시 계산하면 두 화면이 서로 다른
 * 말을 하게 된다. **모르는 값은 null 로 온다 — 0 으로 채우지 않는다.**
 * 폴리마켓의 평가액이 그렇다(451 차단으로 산출 불가).
 */

export type TrackKey = "crypto" | "whale" | "stock_us" | "stock_kr" | "polymarket";

/** 트랙 상태. **`stopped`·`held` 는 사유가 반드시 온다.** */
export type TrackStatus = "running" | "stopped" | "held" | "excluded";

export interface TrackPayload {
  key: TrackKey;
  label: string;
  currency: string;
  startingCapital: number;
  /** 산출 불가면 null. */
  currentCapital: number | null;
  realized: number | null;
  unrealized: number | null;
  /** **실현 기준**(PART C-1). */
  returnPct: number | null;
  trades: number | null;
  winRatePct: number | null;
  profitFactor: number | null;
  mddPct: number | null;
  sampleNote: string | null;
  status: TrackStatus;
  /** `running` 이 아니면 채워져 있어야 한다. */
  statusReason: string | null;
  /** **숨기지 않는다**(PART D-2). */
  leverage: number | null;
  benchmarkLabel: string | null;
  benchmarkStart: number | null;
  benchmarkCurrent: number | null;
  /** FCE 가 낸 값. 랩이 시작·현재로 다시 계산하지 않는다. */
  benchmarkReturnPct: number | null;
  /** 정지 근거 메모. */
  evidenceNote: string | null;
  /**
   * **유효일 / 달력일.** FCE 가 재는 값이다.
   *
   * 호스트가 자면 수집이 멈추고 그 하루는 검증에 안 들어간다. 달력으로 48일이
   * 지났어도 유효일이 3일이면 **표본은 3일치다.** 이걸 안 적으면 화면이 두 달치
   * 성과처럼 보인다.
   */
  elapsedDays: number | null;
  calendarDays: number | null;
  asOf: string;
}

export interface PositionPayload {
  id: string;
  trackKey: TrackKey;
  symbol: string;
  direction: string;
  leverage: number | null;
  marginUsdt: number | null;
  /** 증거금 대비. **−100% 아래가 올 수 있다** — FCE 에 청산 모델이 없다. */
  netReturnPct: number | null;
  healthScore: number | null;
  entryAt: string | null;
  entryPrice: number | null;
  /** UI-06 — 현재가·수량·명목·누적 비용·미실현(USDT). FCE 값 그대로. */
  markPrice: number | null;
  quantity: number | null;
  notionalUsdt: number | null;
  costsUsdt: number | null;
  unrealizedUsdt: number | null;
  timeframe: string | null;
  stance: string | null;
  /**
   * UI-06 가격 레일 — **FCE 페이퍼 포지션만**(광혁 결정 2026-09-26).
   *
   * LAB-08 은 목표가·손절선이 화면 밖으로 나가지 않게 막았다. 그 규칙은 **랩 자체 엔진**의
   * 포지션(`@fomo/lab` `toLivePosition`)에 그대로 남는다. FCE 페이퍼의 무효화·익절은 UI-06 이
   * 화면의 핵심으로 요구했고, 공개해도 된다고 정했다. **라이브(Bitget 계좌) 포지션은 받지 않는다.**
   */
  invalidationPrice: number | null;
  /** 지금 걸린 손절선 — 부분 익절 뒤 본전으로 올라간다. `invalidationDistancePct` 는 이 선까지다. */
  stopPrice: number | null;
  takeProfitPrice: number | null;
  takeProfit2Price: number | null;
  invalidationDistancePct: number | null;
  takeProfitDistancePct: number | null;
  /** 진입 근거 — FCE 가 진입할 때 적은 주장들. FCE 순서 그대로, 칸은 이름으로 옮긴다. */
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  /** `level` · `mtf` · `wyckoff` · `liquidity` · `volume` · `structure` … */
  engine: string;
  claim: string;
  confidence: number | null;
  direction: string | null;
}

function evidenceOf(raw: unknown): EvidenceItem[] {
  const items =
    typeof raw === "object" && raw !== null && Array.isArray((raw as Record<string, unknown>).items)
      ? ((raw as Record<string, unknown>).items as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return items.flatMap((it) => {
    const r = typeof it === "object" && it !== null ? (it as Record<string, unknown>) : {};
    if (typeof r.claim !== "string" || r.claim.length === 0) return [];
    return [
      {
        engine: typeof r.engine === "string" ? r.engine : "",
        claim: r.claim,
        confidence: finite(r.confidence),
        direction: typeof r.direction === "string" ? r.direction : null,
      },
    ];
  });
}

/** UI-06 캔들 — `[t(초), o, h, l, c]`. 시세라 계좌 정보가 없다. */
export type Candle = [number, number, number, number, number];

export const CHART_TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];

export interface ChartPayload {
  symbol: string;
  timeframe: ChartTimeframe;
  candles: Candle[];
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * FCE `/api/paper/dashboard` 의 `open_trades[]` 한 건 → 포지션.
 *
 * ## 손익은 `exit_monitor.mark_net_return_pct` 다 (UI-FIX B-2)
 *
 * 보유 중인 거래의 `net_return_pct` 는 **진입할 때 한 번 적히고 부분 청산 때만 바뀐다**
 * (FCE `paper/policy.py` — `net_return_pct = −entry_cost / margin`). 증거금 100 · 3배면
 * 진입 비용 비율이 전부 같아서, 부분 청산 안 한 포지션은 모두 −0.27% 로 올라왔다.
 * 현재가 기준 손익은 FCE 가 `exit_monitor` 에 따로 싣는다(`paper_exit_monitor`).
 *
 * 현재가를 모르면 `exit_monitor` 가 없다 — 그때는 **null**. 진입 비용을 손익인 척 올리지 않는다.
 *
 * ## 건강도는 FCE 페이퍼 거래에 없다 (B-3)
 *
 * FCE 로컬 UI 의 건강도 게이지는 **계좌 포지션**(`/api/live/positions`)의 것이다. 페이퍼 거래
 * (`PaperTrade`)에는 그 칸이 없다. 계좌 포지션 값을 심볼로 붙이면 다른 포지션의 판정이 된다 —
 * 붙이지 않는다. FCE 가 페이퍼에 `health_score` 를 싣는 날 그대로 들어온다.
 */
export function positionFromOpenTrade(t: Record<string, unknown>): PositionPayload | null {
  if (typeof t.id !== "string" && typeof t.id !== "number") return null;
  const monitor =
    typeof t.exit_monitor === "object" && t.exit_monitor !== null ? (t.exit_monitor as Record<string, unknown>) : {};
  const stance =
    typeof t.current_stance === "object" && t.current_stance !== null
      ? (t.current_stance as Record<string, unknown>).stance
      : null;
  const plan = typeof t.target_plan === "object" && t.target_plan !== null ? (t.target_plan as Record<string, unknown>) : {};
  const sizing = typeof plan.sizing === "object" && plan.sizing !== null ? (plan.sizing as Record<string, unknown>) : {};
  return {
    id: String(t.id),
    trackKey: "crypto",
    symbol: String(t.symbol ?? ""),
    direction: String(t.direction ?? ""),
    leverage: finite(t.leverage),
    marginUsdt: finite(t.margin_usdt),
    netReturnPct: finite(monitor.mark_net_return_pct),
    healthScore: finite(t.health_score),
    entryAt: typeof t.entry_at === "string" ? t.entry_at : null,
    entryPrice: finite(t.entry_price),
    markPrice: finite(monitor.mark_price),
    // 부분 익절 뒤에는 남은 수량이 보유분이다.
    quantity: finite(t.remaining_quantity) ?? finite(t.quantity),
    notionalUsdt: finite(sizing.notional_usdt),
    costsUsdt: finite(t.costs_usdt),
    unrealizedUsdt: finite(monitor.mark_net_pnl_usdt),
    timeframe: typeof t.timeframe === "string" ? t.timeframe : null,
    stance: typeof stance === "string" ? stance : null,
    invalidationPrice: finite(t.invalidation_price),
    stopPrice: finite(t.stop_price),
    takeProfitPrice: finite(t.take_profit_price),
    takeProfit2Price: finite(t.take_profit_2_price),
    invalidationDistancePct: finite(monitor.invalidation_distance_pct),
    takeProfitDistancePct: finite(monitor.take_profit_distance_pct),
    evidence: evidenceOf(t.entry_evidence),
  };
}

/**
 * 닫힌 거래 한 건.
 *
 * ## 목표가·손절선 칸이 없는 것은 실수가 아니다
 *
 * FCE 응답에는 `take_profit_price` · `stop_price` · `invalidation_price` ·
 * `target_plan` 이 있다. **여기에 칸을 만들지 않는다** — `LAB-08` 이 화면에서 막은
 * 값이고, 받아둔 값은 언젠가 화면에 샌다. 여기 있는 것은 **결과**뿐이다.
 *
 * `exitReason` 은 다르다. 닫힌 거래가 **왜 끝났는지는 과거의 사실**이고, 그게
 * 없으면 이력이 "얼마 벌었다" 뿐인 표가 된다.
 */
export interface TradePayload {
  id: string;
  trackKey: TrackKey;
  symbol: string;
  direction: string;
  assetClass: string | null;
  timeframe: string | null;
  leverage: number | null;
  marginUsdt: number | null;
  entryAt: string | null;
  entryPrice: number | null;
  exitAt: string | null;
  exitPrice: number | null;
  grossPnlUsdt: number | null;
  /** 수수료·펀딩비. **빼지 않으면 성과가 부풀려진다.** */
  costsUsdt: number | null;
  netPnlUsdt: number | null;
  netReturnPct: number | null;
  exitReason: string | null;
  lossTags: string[];
  holdingBars: number | null;
}

/** FCE 가 관측 부족으로 판정한 날 (UI-04 C-2). */
export interface LostDayPayload {
  trackKey: TrackKey;
  day: string;
  coveragePct: number;
  reason: string;
}

export interface WhalePayload {
  walletsTotal: number;
  eligible: number;
  /** `{ market_maker: 7, sample: 66, win_rate: 7 }` 꼴. */
  rejected: Record<string, number>;
  passers: string[];
  followWinPct: number | null;
  followTrades: number | null;
  followPf: number | null;
  followNetUsdt: number | null;
  /** `{ count, unit, min, median, p90, max }`. */
  latency: Record<string, unknown> | null;
  drift: Record<string, unknown> | null;
  asOf: string;
}

export interface FcePayload {
  /** 업로더가 FCE 를 읽은 시각. */
  at: string;
  tracks: TrackPayload[];
  positions: PositionPayload[];
  /** 닫힌 거래. 없으면 빈 배열 — **없다고 지우지 않는다.** */
  trades: TradePayload[];
  /** FCE 관측 유실일. 트랙 단위로 통째로 바뀐다. */
  lostDays: LostDayPayload[];
  whale: WhalePayload | null;
  /** UI-06 — 열린 포지션 심볼의 캔들. 없으면 빈 배열(옛 업로더) — 차트 자리가 "없다" 고 말한다. */
  charts: ChartPayload[];
}

const STATUSES: readonly TrackStatus[] = ["running", "stopped", "held", "excluded"];
const KEYS: readonly TrackKey[] = ["crypto", "whale", "stock_us", "stock_kr", "polymarket"];

export interface PayloadProblem {
  path: string;
  message: string;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 들어온 것을 검사한다. **문제를 모아서 돌려준다** — 첫 번째에서 멈추면
 * 한 번에 하나씩 고치게 되고, 업로더는 15분마다 돈다.
 */
export function checkPayload(value: unknown): { payload: FcePayload | null; problems: PayloadProblem[] } {
  const problems: PayloadProblem[] = [];
  if (typeof value !== "object" || value === null) {
    return { payload: null, problems: [{ path: "", message: "객체가 아니다" }] };
  }
  const body = value as Record<string, unknown>;

  if (typeof body.at !== "string" || Number.isNaN(Date.parse(body.at))) {
    problems.push({ path: "at", message: "ISO 시각이어야 한다" });
  }
  if (!Array.isArray(body.tracks) || body.tracks.length === 0) {
    problems.push({ path: "tracks", message: "비어 있지 않은 배열이어야 한다" });
  }

  const tracks: TrackPayload[] = [];
  for (const [index, raw] of (Array.isArray(body.tracks) ? body.tracks : []).entries()) {
    const t = raw as Record<string, unknown>;
    const path = `tracks[${index}]`;
    if (!KEYS.includes(t.key as TrackKey)) {
      problems.push({ path: `${path}.key`, message: `${KEYS.join(" | ")} 중 하나여야 한다` });
      continue;
    }
    if (!STATUSES.includes(t.status as TrackStatus)) {
      problems.push({ path: `${path}.status`, message: `${STATUSES.join(" | ")} 중 하나여야 한다` });
      continue;
    }
    // **정지·보류는 사유가 필수다.** 사유 없는 정지는 화면에서 이유를 못 말한다.
    if (t.status !== "running" && !(typeof t.statusReason === "string" && t.statusReason.length > 0)) {
      problems.push({ path: `${path}.statusReason`, message: "running 이 아니면 사유가 필요하다" });
      continue;
    }
    if (typeof t.startingCapital !== "number" || !Number.isFinite(t.startingCapital)) {
      problems.push({ path: `${path}.startingCapital`, message: "숫자여야 한다" });
      continue;
    }
    tracks.push({
      key: t.key as TrackKey,
      label: String(t.label ?? t.key),
      currency: String(t.currency ?? ""),
      startingCapital: t.startingCapital,
      currentCapital: num(t.currentCapital),
      realized: num(t.realized),
      unrealized: num(t.unrealized),
      returnPct: num(t.returnPct),
      trades: num(t.trades),
      winRatePct: num(t.winRatePct),
      profitFactor: num(t.profitFactor),
      mddPct: num(t.mddPct),
      sampleNote: typeof t.sampleNote === "string" ? t.sampleNote : null,
      status: t.status as TrackStatus,
      statusReason: typeof t.statusReason === "string" ? t.statusReason : null,
      leverage: num(t.leverage),
      benchmarkLabel: typeof t.benchmarkLabel === "string" ? t.benchmarkLabel : null,
      benchmarkStart: num(t.benchmarkStart),
      benchmarkCurrent: num(t.benchmarkCurrent),
      benchmarkReturnPct: num(t.benchmarkReturnPct),
      evidenceNote: typeof t.evidenceNote === "string" ? t.evidenceNote : null,
      elapsedDays: num(t.elapsedDays),
      calendarDays: num(t.calendarDays),
      asOf: typeof t.asOf === "string" ? t.asOf : (body.at as string),
    });
  }

  const positions: PositionPayload[] = [];
  for (const [index, raw] of (Array.isArray(body.positions) ? body.positions : []).entries()) {
    const p = raw as Record<string, unknown>;
    if (typeof p.id !== "string" || !KEYS.includes(p.trackKey as TrackKey) || typeof p.symbol !== "string") {
      problems.push({ path: `positions[${index}]`, message: "id · trackKey · symbol 이 필요하다" });
      continue;
    }
    positions.push({
      id: p.id,
      trackKey: p.trackKey as TrackKey,
      symbol: p.symbol,
      direction: String(p.direction ?? ""),
      leverage: num(p.leverage),
      marginUsdt: num(p.marginUsdt),
      netReturnPct: num(p.netReturnPct),
      healthScore: num(p.healthScore),
      entryAt: typeof p.entryAt === "string" ? p.entryAt : null,
      entryPrice: num(p.entryPrice),
      markPrice: num(p.markPrice),
      quantity: num(p.quantity),
      notionalUsdt: num(p.notionalUsdt),
      costsUsdt: num(p.costsUsdt),
      unrealizedUsdt: num(p.unrealizedUsdt),
      timeframe: typeof p.timeframe === "string" ? p.timeframe : null,
      stance: typeof p.stance === "string" ? p.stance : null,
      invalidationPrice: num(p.invalidationPrice),
      stopPrice: num(p.stopPrice),
      takeProfitPrice: num(p.takeProfitPrice),
      takeProfit2Price: num(p.takeProfit2Price),
      invalidationDistancePct: num(p.invalidationDistancePct),
      takeProfitDistancePct: num(p.takeProfitDistancePct),
      // 옛 업로더는 `evidence` 를 안 보낸다 — 빈 배열. 들어온 것은 같은 검사를 한 번 더 지난다.
      evidence: evidenceOf(p.evidence),
    });
  }

  const charts: ChartPayload[] = [];
  for (const [index, raw] of (Array.isArray(body.charts) ? body.charts : []).entries()) {
    const c = raw as Record<string, unknown>;
    const ok =
      typeof c.symbol === "string" &&
      CHART_TIMEFRAMES.includes(c.timeframe as ChartTimeframe) &&
      Array.isArray(c.candles) &&
      (c.candles as unknown[]).every(
        (k) => Array.isArray(k) && k.length === 5 && (k as unknown[]).every((v) => typeof v === "number" && Number.isFinite(v))
      );
    if (!ok) {
      problems.push({ path: `charts[${index}]`, message: "symbol · timeframe(15m|1h|4h|1d) · candles[t,o,h,l,c][] 가 필요하다" });
      continue;
    }
    charts.push({ symbol: c.symbol as string, timeframe: c.timeframe as ChartTimeframe, candles: c.candles as Candle[] });
  }

  // 닫힌 거래. **id · trackKey 만 필수다** — 나머지는 FCE 가 모르면 null 로 온다.
  const trades: TradePayload[] = [];
  for (const [index, raw] of (Array.isArray(body.trades) ? body.trades : []).entries()) {
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== "string" || !KEYS.includes(t.trackKey as TrackKey)) {
      problems.push({ path: `trades[${index}]`, message: "id · trackKey 가 필요하다" });
      continue;
    }
    trades.push({
      id: t.id,
      trackKey: t.trackKey as TrackKey,
      symbol: String(t.symbol ?? ""),
      direction: String(t.direction ?? ""),
      assetClass: typeof t.assetClass === "string" ? t.assetClass : null,
      timeframe: typeof t.timeframe === "string" ? t.timeframe : null,
      leverage: num(t.leverage),
      marginUsdt: num(t.marginUsdt),
      entryAt: typeof t.entryAt === "string" ? t.entryAt : null,
      entryPrice: num(t.entryPrice),
      exitAt: typeof t.exitAt === "string" ? t.exitAt : null,
      exitPrice: num(t.exitPrice),
      grossPnlUsdt: num(t.grossPnlUsdt),
      costsUsdt: num(t.costsUsdt),
      netPnlUsdt: num(t.netPnlUsdt),
      netReturnPct: num(t.netReturnPct),
      exitReason: typeof t.exitReason === "string" ? t.exitReason : null,
      lossTags: Array.isArray(t.lossTags) ? t.lossTags.map(String) : [],
      holdingBars: num(t.holdingBars),
    });
  }

  const lostDays: LostDayPayload[] = [];
  for (const [index, raw] of (Array.isArray(body.lostDays) ? body.lostDays : []).entries()) {
    const d = raw as Record<string, unknown>;
    const coverage = num(d.coveragePct);
    if (!KEYS.includes(d.trackKey as TrackKey) || typeof d.day !== "string" || coverage === null) {
      problems.push({ path: `lostDays[${index}]`, message: "trackKey · day · coveragePct 가 필요하다" });
      continue;
    }
    lostDays.push({
      trackKey: d.trackKey as TrackKey,
      day: d.day,
      coveragePct: coverage,
      reason: typeof d.reason === "string" ? d.reason : "",
    });
  }

  let whale: WhalePayload | null = null;
  if (body.whale && typeof body.whale === "object") {
    const w = body.whale as Record<string, unknown>;
    if (typeof w.walletsTotal === "number" && typeof w.eligible === "number") {
      whale = {
        walletsTotal: w.walletsTotal,
        eligible: w.eligible,
        rejected: (w.rejected as Record<string, number>) ?? {},
        passers: Array.isArray(w.passers) ? (w.passers as string[]) : [],
        followWinPct: num(w.followWinPct),
        followTrades: num(w.followTrades),
        followPf: num(w.followPf),
        followNetUsdt: num(w.followNetUsdt),
        latency: (w.latency as Record<string, unknown>) ?? null,
        drift: (w.drift as Record<string, unknown>) ?? null,
        asOf: typeof w.asOf === "string" ? w.asOf : (body.at as string),
      };
    } else {
      problems.push({ path: "whale", message: "walletsTotal · eligible 이 필요하다" });
    }
  }

  if (problems.length > 0) return { payload: null, problems };
  return { payload: { at: body.at as string, tracks, positions, trades, lostDays, whale, charts }, problems: [] };
}
