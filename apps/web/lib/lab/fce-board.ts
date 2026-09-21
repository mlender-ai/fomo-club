/**
 * LAB-BRIDGE PART C — FCE 거울 화면의 데이터.
 *
 * **여기서 계산하는 것은 딱 둘이다** — 마지막 업로드 이후 경과 시간과 끊김 구간.
 * 그 둘은 랩만 알 수 있다(FCE 는 자기가 언제 안 읽혔는지 모른다).
 * 나머지 숫자는 전부 FCE 가 낸 값을 그대로 낸다.
 */
import { prisma } from "../prisma";

/** 이 시간 넘게 업로드가 없으면 끊긴 것으로 본다. 주기가 15분이라 두 번 거른 값이다. */
export const STALE_MS = 35 * 60 * 1000;

/** 화면에 남길 최근 업로드 기록 수. */
const RECENT_UPLOADS = 40;

export interface FceTrackRow {
  key: string;
  label: string;
  currency: string;
  startingCapital: number;
  currentCapital: number | null;
  realized: number | null;
  unrealized: number | null;
  returnPct: number | null;
  trades: number | null;
  winRatePct: number | null;
  profitFactor: number | null;
  mddPct: number | null;
  sampleNote: string | null;
  status: string;
  statusReason: string | null;
  evidenceNote: string | null;
  leverage: number | null;
  benchmarkLabel: string | null;
  benchmarkReturnPct: number | null;
  asOf: Date;
}

export interface FcePositionRow {
  id: string;
  symbol: string;
  direction: string;
  leverage: number | null;
  marginUsdt: number | null;
  netReturnPct: number | null;
  healthScore: number | null;
  entryAt: Date | null;
  /**
   * **청산 수준 경고**(PART D-1).
   *
   * FCE 에 청산 모델이 없어 손익률이 −100% 아래로 갈 수 있다. 실제 거래소였으면
   * 증거금이 이미 없어진 자리다. 화면이 그 사실을 말하지 않으면 페이퍼 성과가
   * 실전보다 좋게 보이는 것을 아무도 눈치채지 못한다.
   */
  liquidationLevel: boolean;
}

export interface FceFreshness {
  lastAt: Date | null;
  ageMs: number | null;
  stale: boolean;
  /** 최근 기록에서 잡힌 끊김 구간 (PART B-4). */
  gaps: { from: Date; to: Date; minutes: number }[];
  lastError: { at: Date; error: string } | null;
  /** 최근 업로드 성공률. */
  recent: { ok: number; total: number };
}

export interface FceWhaleView {
  walletsTotal: number;
  eligible: number;
  rejected: Record<string, number>;
  passers: string[];
  followWinPct: number | null;
  followTrades: number | null;
  followPf: number | null;
  followNetUsdt: number | null;
  latency: Record<string, unknown> | null;
  drift: Record<string, unknown> | null;
  asOf: Date;
}

export interface FceBoard {
  tracks: FceTrackRow[];
  positions: FcePositionRow[];
  whale: FceWhaleView | null;
  freshness: FceFreshness;
}

/**
 * 청산 수준 판정.
 *
 * 증거금 대비 −90% 를 넘으면 실거래소에서는 사실상 끝난 자리다(유지증거금이 남아
 * 있을 수 없다). **−100% 를 기준으로 삼지 않는다** — 거기까지 가면 이미 늦었고,
 * 그 전에 청산된다는 것이 요점이다.
 */
const LIQUIDATION_PCT = -90;

function toNumber(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

export async function readFceBoard(now: Date = new Date()): Promise<FceBoard> {
  const [tracks, positions, whale, uploads] = await Promise.all([
    prisma.fceTrack.findMany({ orderBy: { key: "asc" } }),
    prisma.fcePosition.findMany({ orderBy: [{ netReturnPct: "asc" }] }),
    prisma.fceWhale.findUnique({ where: { id: 1 } }),
    prisma.fceUpload.findMany({ orderBy: { at: "desc" }, take: RECENT_UPLOADS }),
  ]);

  // ── 신선도 ──────────────────────────────────────────────────────────────
  //
  // **성공한 업로드만 센다.** 실패도 기록에는 남지만, 실패한 순간은 데이터가
  // 갱신되지 않은 순간이다 — 그걸 "최근 갱신" 으로 세면 화면이 거짓이 된다.
  const ok = uploads.filter((u) => u.ok);
  const lastAt = ok[0]?.at ?? null;
  const ageMs = lastAt ? now.getTime() - lastAt.getTime() : null;

  const gaps: FceFreshness["gaps"] = [];
  const ascending = [...ok].reverse();
  for (let i = 1; i < ascending.length; i += 1) {
    const prev = ascending[i - 1]?.at;
    const cur = ascending[i]?.at;
    if (!prev || !cur) continue;
    const span = cur.getTime() - prev.getTime();
    if (span > STALE_MS) {
      gaps.push({ from: prev, to: cur, minutes: Math.round(span / 60_000) });
    }
  }
  // 지금도 끊겨 있으면 그것도 구간이다 — 끝이 아직 안 온 구간.
  const failed = uploads.find((u) => !u.ok) ?? null;

  const freshness: FceFreshness = {
    lastAt,
    ageMs,
    stale: ageMs === null || ageMs > STALE_MS,
    gaps: gaps.slice(-5).reverse(),
    lastError: failed && failed.error ? { at: failed.at, error: failed.error } : null,
    recent: { ok: ok.length, total: uploads.length },
  };

  // ── 트랙 순서 ────────────────────────────────────────────────────────────
  //
  // **FCE 일일 리포트와 같은 순서**로 고정한다. 성적순으로 정렬하면 잘 나온 트랙이
  // 위로 올라가고, 그건 이 화면이 하면 안 되는 일이다 — 멈춘 트랙이 아래로 밀려
  // 눈에 안 띈다. 자리가 고정돼 있어야 "어제 여기 있던 게 오늘 왜 다른가" 를 본다.
  const order: Record<string, number> = {
    crypto: 0,
    whale: 1,
    stock_us: 2,
    stock_kr: 3,
    polymarket: 4,
  };
  const rows: FceTrackRow[] = tracks
    .map((t) => ({
      key: t.key,
      label: t.label,
      currency: t.currency,
      startingCapital: t.startingCapital.toNumber(),
      currentCapital: toNumber(t.currentCapital),
      realized: toNumber(t.realized),
      unrealized: toNumber(t.unrealized),
      returnPct: t.returnPct,
      trades: t.trades,
      winRatePct: t.winRatePct,
      profitFactor: t.profitFactor,
      mddPct: t.mddPct,
      sampleNote: t.sampleNote,
      status: t.status,
      statusReason: t.statusReason,
      evidenceNote: t.evidenceNote,
      leverage: t.leverage,
      benchmarkLabel: t.benchmarkLabel,
      benchmarkReturnPct: t.benchmarkReturnPct,
      asOf: t.asOf,
    }))
    .sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9));

  return {
    tracks: rows,
    positions: positions.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      direction: p.direction,
      leverage: p.leverage,
      marginUsdt: p.marginUsdt,
      netReturnPct: p.netReturnPct,
      healthScore: p.healthScore,
      entryAt: p.entryAt,
      liquidationLevel: p.netReturnPct !== null && p.netReturnPct <= LIQUIDATION_PCT,
    })),
    whale: whale
      ? {
          walletsTotal: whale.walletsTotal,
          eligible: whale.eligible,
          rejected: (whale.rejected as Record<string, number>) ?? {},
          passers: (whale.passers as string[]) ?? [],
          followWinPct: whale.followWinPct,
          followTrades: whale.followTrades,
          followPf: whale.followPf,
          followNetUsdt: whale.followNetUsdt,
          latency: (whale.latency as Record<string, unknown>) ?? null,
          drift: (whale.drift as Record<string, unknown>) ?? null,
          asOf: whale.asOf,
        }
      : null,
    freshness,
  };
}

// ── 거래 이력 ────────────────────────────────────────────────────────────────

export interface FceTradeRow {
  id: string;
  trackKey: string;
  symbol: string;
  direction: string;
  leverage: number | null;
  entryAt: Date | null;
  exitAt: Date | null;
  entryPrice: number | null;
  exitPrice: number | null;
  grossPnlUsdt: number | null;
  costsUsdt: number | null;
  netPnlUsdt: number | null;
  netReturnPct: number | null;
  exitReason: string | null;
  lossTags: string[];
  holdingBars: number | null;
}

export interface FceLedger {
  trades: FceTradeRow[];
  /** 표에 보이는 것 말고 **전부**에 대한 합계. 보이는 것만 더하면 화면이 거짓말한다. */
  total: {
    count: number;
    wins: number;
    losses: number;
    flat: number;
    grossUsdt: number;
    costsUsdt: number;
    netUsdt: number;
    /** 비용이 총손익을 얼마나 먹었나. 분모가 0이면 null. */
    costSharePct: number | null;
  };
  /** 가장 이른 · 가장 늦은 청산 시각. 표가 어느 기간의 것인지 화면이 말해야 한다. */
  span: { from: Date | null; to: Date | null };
}

/** 표에 몇 줄까지 보일 것인가. 합계는 이것과 무관하게 전부를 센다. */
export const LEDGER_ROWS = 60;

/**
 * 거래 이력.
 *
 * **비용을 따로 보여준다.** `net = gross − costs` 인데 `net` 만 보이면 수수료·펀딩비가
 * 성과를 얼마나 먹었는지 안 보인다. 크립토 무기한 선물에서 이건 작은 항이 아니다.
 */
export async function readFceLedger(): Promise<FceLedger> {
  const [rows, agg, counts, bounds] = await Promise.all([
    prisma.fceTrade.findMany({ orderBy: [{ exitAt: "desc" }], take: LEDGER_ROWS }),
    prisma.fceTrade.aggregate({
      _sum: { grossPnlUsdt: true, costsUsdt: true, netPnlUsdt: true },
      _count: { id: true },
    }),
    Promise.all([
      prisma.fceTrade.count({ where: { netPnlUsdt: { gt: 0 } } }),
      prisma.fceTrade.count({ where: { netPnlUsdt: { lt: 0 } } }),
    ]),
    prisma.fceTrade.aggregate({ _min: { exitAt: true }, _max: { exitAt: true } }),
  ]);

  const [wins, losses] = counts;
  const count = agg._count.id;
  const grossUsdt = agg._sum.grossPnlUsdt ?? 0;
  const costsUsdt = agg._sum.costsUsdt ?? 0;
  const netUsdt = agg._sum.netPnlUsdt ?? 0;

  return {
    trades: rows.map((t) => ({
      id: t.id,
      trackKey: t.trackKey,
      symbol: t.symbol,
      direction: t.direction,
      leverage: t.leverage,
      entryAt: t.entryAt,
      exitAt: t.exitAt,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      grossPnlUsdt: t.grossPnlUsdt,
      costsUsdt: t.costsUsdt,
      netPnlUsdt: t.netPnlUsdt,
      netReturnPct: t.netReturnPct,
      exitReason: t.exitReason,
      lossTags: Array.isArray(t.lossTags) ? (t.lossTags as unknown[]).map(String) : [],
      holdingBars: t.holdingBars,
    })),
    total: {
      count,
      wins,
      losses,
      // 정확히 0 이거나 값이 없는 거래. **승·패로 나누지 않는다.**
      flat: count - wins - losses,
      grossUsdt,
      costsUsdt,
      netUsdt,
      costSharePct: Math.abs(grossUsdt) > 0 ? (costsUsdt / Math.abs(grossUsdt)) * 100 : null,
    },
    span: { from: bounds._min.exitAt, to: bounds._max.exitAt },
  };
}
