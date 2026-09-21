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
  return { payload: { at: body.at as string, tracks, positions, whale }, problems: [] };
}
