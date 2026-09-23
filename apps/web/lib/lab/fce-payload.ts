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
    });
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
  return { payload: { at: body.at as string, tracks, positions, trades, lostDays, whale }, problems: [] };
}
