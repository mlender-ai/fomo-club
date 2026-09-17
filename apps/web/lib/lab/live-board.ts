/**
 * LAB-08 — 전광판 데이터.
 *
 * 백테스트 보드(`backtest-board.ts`)와 **일부러 나눠 두었다.** 백테스트는 끝난 구간을
 * 한 번 읽으면 되고, 전광판은 1분마다 다시 읽힌다 — 성격이 다르다.
 *
 * ## 나가면 안 되는 것 (PART B-2)
 *
 * 보유 포지션에는 손절선·목표가가 붙어 있다. **그 객체를 그대로 내보내지 않는다** —
 * 칸을 하나씩 옮기는 `toLivePosition` 을 거치고, `findForbiddenKeys` 로 확인한다.
 * 규칙은 `@fomo/lab` 의 `live-view.ts` 에 있다.
 */
import {
  COMPARISON_MIN_DAYS,
  MIN_SAMPLE,
  PAPER_CAVEAT,
  feedStatus,
  toLivePosition,
  type LivePosition,
} from "@fomo/lab";

import { prisma } from "../prisma";
import { STALE_AFTER_MS } from "./data-status";

export { COMPARISON_MIN_DAYS, PAPER_CAVEAT };

/** LAB-07 §0 — 전략당 시작 자본. */
export const INITIAL_CAPITAL = 10_000;

/**
 * 자산곡선의 점이 이보다 벌어져 있으면 **페이퍼가 멈췄던 구간**이다.
 * 봉이 1시간이므로 두 배를 넘으면 한 번은 걸렀다는 뜻이다.
 */
const EQUITY_GAP_MS = 2 * 60 * 60 * 1000;

export interface LiveRow {
  strategyId: string;
  /** 페이퍼가 아직 시작 안 된 전략은 null 이다. */
  runId: string | null;
  label: string;
  equity: number | null;
  returnPct: number | null;
  mdd: number | null;
  cagrMdd: number | null;
  trades: number;
  positions: LivePosition[];
  /** 표본 `MIN_SAMPLE`(30) 미만은 **순위를 매기지 않는다**(LAB-00 §7). */
  ranked: boolean;
  stopped: boolean;
  stopReason: string | null;
}

export interface LiveWarning {
  kind: "feed" | "gap" | "paper";
  text: string;
}

export interface LiveBoard {
  /** 이 응답을 만든 시각. 화면이 "N초 전" 을 여기서 잰다. */
  at: string;
  /**
   * 페이퍼 운용 일수. **`Run` 이 만들어진 시각부터** 센다.
   *
   * 자산곡선 첫 점부터 세면 안 된다 — 첫 실행이 과거 200봉을 워밍업으로 재생하므로
   * 곡선은 시작 전부터 그려져 있다. 그걸 운용 기간이라고 부르면 **8일을 공짜로 얻는다.**
   * 재생 구간이 있다는 사실은 경고로 따로 적는다.
   */
  days: number | null;
  startedAt: string | null;
  initialCapital: number;
  ranked: LiveRow[];
  unranked: LiveRow[];
  /** **정지된 전략도 남는다.** 지우지 않는다(LAB-00 §7). */
  stopped: LiveRow[];
  benchmark: {
    label: string;
    equity: number | null;
    returnPct: number | null;
    mdd: number | null;
    cagrMdd: number | null;
  };
  /** A-2 — 표 **위**에 뜬다. */
  warnings: LiveWarning[];
  caveat: string;
}

interface StoredState {
  open?: unknown;
  lastPrice?: unknown;
}

/** `PaperState.state` 에서 보유 포지션만 꺼낸다. */
function positionsOf(state: unknown, now: Date): LivePosition[] {
  if (typeof state !== "object" || state === null) return [];
  const { open, lastPrice } = state as StoredState;
  if (!Array.isArray(open)) return [];
  const marks: Record<string, unknown> =
    typeof lastPrice === "object" && lastPrice !== null
      ? (lastPrice as Record<string, unknown>)
      : {};

  const out: LivePosition[] = [];
  for (const raw of open) {
    if (typeof raw !== "object" || raw === null) continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.symbol !== "string" || typeof p.entryPrice !== "number") continue;
    const entryAt = typeof p.entryAt === "string" ? new Date(p.entryAt) : null;
    if (!entryAt || Number.isNaN(entryAt.getTime())) continue;
    const mark = marks[p.symbol];

    out.push(
      toLivePosition(
        {
          symbol: p.symbol,
          side: p.side === "SHORT" ? "SHORT" : "LONG",
          entryAt,
          entryPrice: p.entryPrice,
          entryReason: "",
          qty: typeof p.qty === "number" ? p.qty : 0,
          // 아래 값들은 `OpenPosition` 타입을 채우기 위한 자리일 뿐 **나가지 않는다** —
          // `toLivePosition` 이 내보낼 칸만 골라 옮긴다. 저장된 진짜 손절선·목표가는
          // 여기서 아예 읽지 않는다.
          stopPrice: 0,
          targetPrice: null,
          entryCost: 0,
          funding: 0,
          maxHoldBars: null,
          barsHeld: 0,
          exitSignalPending: false,
        },
        typeof mark === "number" ? mark : null,
        now
      )
    );
  }
  return out;
}

/** 같은 기간의 BTC. 벤치마크는 **항상 보여준다**(LAB-00 §7). */
async function readBenchmark(from: Date | null): Promise<LiveBoard["benchmark"]> {
  const rows = await prisma.benchmark.findMany({
    where: { symbol: "BTC", ...(from ? { at: { gte: from } } : {}) },
    orderBy: { at: "asc" },
    select: { price: true },
  });
  const prices = rows.map((r) => r.price.toNumber()).filter((p) => p > 0);
  const start = prices[0];
  const end = prices[prices.length - 1];
  if (prices.length < 2 || start === undefined || end === undefined) {
    return { label: "BTC 보유", equity: null, returnPct: null, mdd: null, cagrMdd: null };
  }

  let peak = start;
  let mdd = 0;
  for (const price of prices) {
    peak = Math.max(peak, price);
    mdd = Math.min(mdd, ((price - peak) / peak) * 100);
  }
  const returnPct = ((end - start) / start) * 100;
  return {
    label: "BTC 보유",
    equity: INITIAL_CAPITAL * (end / start),
    returnPct,
    mdd,
    // 전략과 **같은 기준**으로 잰다 — 기간 수익률 ÷ 낙폭. 낙폭이 0 이면 순위를 안 낸다.
    cagrMdd: mdd < 0 ? returnPct / Math.abs(mdd) : null,
  };
}

/**
 * 페이퍼가 멈췄던 구간. 자산곡선의 점 간격으로 잰다 — **메우지 않고 그대로 센다.**
 *
 * **Run 마다 따로 잰다.** 여러 Run 의 점을 한데 모아 시각만 보면, 한 전략이 멈춘 구간을
 * 다른 전략의 점이 덮어 구멍이 사라진다 — `verify-live` 가 그걸 잡았다.
 */
async function readEquityGaps(
  runIds: readonly string[]
): Promise<{ count: number; last: Date | null }> {
  if (runIds.length === 0) return { count: 0, last: null };
  const rows = await prisma.equity.findMany({
    where: { runId: { in: [...runIds] } },
    orderBy: [{ runId: "asc" }, { at: "asc" }],
    select: { runId: true, at: true },
  });
  let count = 0;
  let last: Date | null = null;
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (!prev || !cur || prev.runId !== cur.runId) continue;
    if (cur.at.getTime() - prev.at.getTime() > EQUITY_GAP_MS) {
      count += 1;
      if (!last || cur.at > last) last = cur.at;
    }
  }
  return { count, last };
}

function ageText(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}분`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간`;
  return `${Math.floor(m / (60 * 24))}일`;
}

export async function readLiveBoard(now: Date = new Date()): Promise<LiveBoard> {
  const strategies = await prisma.strategy.findMany({
    where: { status: { in: ["RUNNING", "PAUSED", "STOPPED"] } },
    orderBy: { createdAt: "asc" },
    include: {
      runs: {
        where: { kind: "PAPER" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { metric: true, paper: true },
      },
    },
  });

  const runIds = strategies.flatMap((s) => (s.runs[0] ? [s.runs[0].id] : []));
  const [latest, prices, gapRows, equityGaps, firstEquity] = await Promise.all([
    runIds.length > 0
      ? prisma.equity.findMany({
          where: { runId: { in: runIds } },
          orderBy: [{ runId: "asc" }, { at: "desc" }],
          distinct: ["runId"],
          select: { runId: true, equity: true },
        })
      : Promise.resolve([] as { runId: string; equity: { toNumber(): number } }[]),
    prisma.latestPrice.findMany({ select: { symbol: true, fetchedAt: true } }),
    prisma.dataGap.findMany({
      where: { interval: "H1" },
      orderBy: { toAt: "desc" },
      take: 5,
      select: { symbol: true, fromAt: true, toAt: true, missing: true },
    }),
    readEquityGaps(runIds),
    runIds.length > 0
      ? prisma.equity.findFirst({
          where: { runId: { in: runIds } },
          orderBy: { at: "asc" },
          select: { at: true },
        })
      : Promise.resolve(null),
  ]);

  /** 페이퍼가 **실제로 시작된** 시각. 가장 먼저 만들어진 Run 기준. */
  const startedAt = strategies.reduce<Date | null>((earliest, s) => {
    const run = s.runs[0];
    if (!run) return earliest;
    return !earliest || run.periodStart < earliest ? run.periodStart : earliest;
  }, null);

  const equityByRun = new Map(latest.map((e) => [e.runId, e.equity.toNumber()]));

  const rows: LiveRow[] = strategies.map((strategy) => {
    const run = strategy.runs[0] ?? null;
    const equity = run ? (equityByRun.get(run.id) ?? null) : null;
    const trades = run?.metric?.trades ?? 0;
    return {
      strategyId: strategy.id,
      runId: run?.id ?? null,
      label: `${strategy.name} v${strategy.version}`,
      equity,
      returnPct: equity === null ? null : ((equity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100,
      mdd: run?.metric?.mdd ?? null,
      cagrMdd: run?.metric?.cagrMdd ?? null,
      trades,
      positions: positionsOf(run?.paper?.state, now),
      ranked: trades >= MIN_SAMPLE,
      stopped: strategy.status === "STOPPED",
      stopReason: strategy.stopReason,
    };
  });

  const feed = feedStatus(
    prices.map((p) => ({ symbol: p.symbol, fetchedAt: p.fetchedAt })),
    now,
    STALE_AFTER_MS
  );

  const warnings: LiveWarning[] = [];
  if (prices.length === 0) {
    warnings.push({
      kind: "feed",
      text: "시세 수집 기록이 없다. 페이퍼는 신규 진입을 하지 않는다.",
    });
  } else if (!feed.ok) {
    // 한 번도 못 받은 종목(`ageMs === null`)이 섞일 수 있다 — 그건 "가장 오래됨" 이 아니라
    // 아예 없는 것이므로 따로 말한다.
    const ages = feed.symbols.flatMap((s) => (s.ageMs === null ? [] : [s.ageMs]));
    const oldest = ages.length > 0 ? Math.max(...ages) : null;
    warnings.push({
      kind: "feed",
      text: `시세가 ${
        oldest === null ? "한 번도 들어오지 않았다" : `${ageText(oldest)}째 갱신되지 않았다`
      } (${feed.blocked.join(", ")}) — 신규 진입은 막혀 있다. 보유·청산은 그대로 평가된다.`,
    });
  }
  if (gapRows.length > 0) {
    const missing = gapRows.reduce((n, g) => n + g.missing, 0);
    const recent = gapRows[0];
    warnings.push({
      kind: "gap",
      text: `봉 데이터에 구멍이 있다 — ${gapRows.length}구간 · ${missing}봉${
        recent ? ` (최근 ${recent.symbol} ${recent.fromAt.toISOString().slice(0, 10)})` : ""
      }. 메우지 않았다 — 그 구간에서는 진입하지 않는다.`,
    });
  }
  // 페이퍼가 언제 마지막으로 봉을 받았나. **표의 숫자는 그 시각 기준이다.**
  const lastBarAt = strategies.reduce<Date | null>((latest, s) => {
    const at = s.runs[0]?.paper?.lastBarAt ?? null;
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  if (lastBarAt && now.getTime() - lastBarAt.getTime() > EQUITY_GAP_MS) {
    warnings.push({
      kind: "paper",
      text: `페이퍼가 ${ageText(now.getTime() - lastBarAt.getTime())}째 새 봉을 못 받았다 — 아래 숫자는 ${lastBarAt
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")} 기준이고 그 뒤로 멈춰 있다.`,
    });
  }

  // 첫 실행의 워밍업 재생 구간. **그 시각에 돌고 있었던 것이 아니다.**
  if (firstEquity && startedAt && firstEquity.at < startedAt) {
    warnings.push({
      kind: "paper",
      text: `자산곡선의 ${firstEquity.at.toISOString().slice(0, 10)} ~ ${startedAt
        .toISOString()
        .slice(0, 10)} 구간은 첫 실행 때 과거 봉을 재생한 워밍업이다 — 그때 실제로 돌고 있던 것이 아니다. 운용 일수에는 세지 않는다.`,
    });
  }

  if (equityGaps.count > 0) {
    warnings.push({
      kind: "paper",
      text: `페이퍼가 멈췄던 구간이 ${equityGaps.count}곳 있다${
        equityGaps.last
          ? ` (최근 ${equityGaps.last.toISOString().slice(0, 16).replace("T", " ")})`
          : ""
      } — 자산곡선이 그 자리에서 끊긴다.`,
    });
  }

  const live = rows.filter((r) => !r.stopped);

  return {
    at: now.toISOString(),
    days: startedAt ? (now.getTime() - startedAt.getTime()) / 86_400_000 : null,
    startedAt: startedAt?.toISOString() ?? null,
    initialCapital: INITIAL_CAPITAL,
    ranked: live
      .filter((r) => r.ranked)
      .sort((a, b) => (b.cagrMdd ?? -Infinity) - (a.cagrMdd ?? -Infinity)),
    unranked: live.filter((r) => !r.ranked),
    stopped: rows.filter((r) => r.stopped),
    benchmark: await readBenchmark(firstEquity?.at ?? null),
    warnings,
    caveat: PAPER_CAVEAT,
  };
}

// ── 전략 상세의 페이퍼 부분 (PART B) ─────────────────────────────────────────

export interface PaperTrade {
  exitAt: string;
  symbol: string;
  side: string;
  pnlPct: number | null;
  holdHours: number;
  /** 청산 **후** 결과다. 청산 **조건**이 아니다(B-2). */
  exitReason: string | null;
}

export interface PaperDetail {
  runId: string;
  days: number;
  startedAt: string;
  /** 자산곡선이 실제로 시작하는 시각. `startedAt` 보다 앞이면 워밍업 재생 구간이 있다. */
  curveFrom: string | null;
  equity: number | null;
  returnPct: number | null;
  positions: LivePosition[];
  metrics: {
    mdd: number | null;
    sharpe: number | null;
    trades: number;
    winRate: number | null;
    profitFactor: number | null;
    avgHoldHours: number | null;
    maxConsecutiveLoss: number;
    /** 누적 펀딩비(금액). 양수면 **낸** 것이다. */
    funding: number;
  };
  recent: PaperTrade[];
  /**
   * B-1 — 백테스트 대비. 기간이 `COMPARISON_MIN_DAYS` 보다 짧으면 **숫자를 내지 않는다.**
   * 며칠치를 연 환산하면 숫자가 혼자 커진다.
   */
  comparison:
    | { enough: false; days: number; requiredDays: number }
    | {
        enough: true;
        backtestCagr: number | null;
        paperAnnualized: number | null;
        diffPp: number | null;
      };
}

export async function readPaperDetail(
  strategyId: string,
  now: Date = new Date()
): Promise<PaperDetail | null> {
  const run = await prisma.run.findFirst({
    where: { strategyId, kind: "PAPER" },
    orderBy: { createdAt: "desc" },
    include: { metric: true, paper: true },
  });
  if (!run) return null;

  const [firstEquity, lastEquity, recent, all, backtest] = await Promise.all([
    prisma.equity.findFirst({
      where: { runId: run.id },
      orderBy: { at: "asc" },
      select: { at: true },
    }),
    prisma.equity.findFirst({
      where: { runId: run.id },
      orderBy: { at: "desc" },
      select: { equity: true },
    }),
    prisma.trade.findMany({
      where: { runId: run.id, exitAt: { not: null } },
      orderBy: { exitAt: "desc" },
      take: 20,
    }),
    prisma.trade.findMany({
      where: { runId: run.id },
      orderBy: { entryAt: "asc" },
      select: { pnl: true, funding: true },
    }),
    prisma.run.findFirst({
      where: { strategyId, kind: "BACKTEST" },
      orderBy: { createdAt: "desc" },
      include: { metric: true },
    }),
  ]);

  let streak = 0;
  let maxStreak = 0;
  let funding = 0;
  for (const trade of all) {
    funding += trade.funding.toNumber();
    if ((trade.pnl?.toNumber() ?? 0) < 0) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  // **운용 일수는 Run 이 만들어진 시각부터다.** 자산곡선은 첫 실행의 워밍업 재생 때문에
  // 그보다 앞에서 시작한다 — 그걸 운용 기간으로 세면 백테스트 대비 비교가 일찍 열린다.
  const startedAt = run.periodStart;
  const days = (now.getTime() - startedAt.getTime()) / 86_400_000;
  const curveFrom = firstEquity?.at ?? null;
  const equity = lastEquity?.equity.toNumber() ?? null;

  let comparison: PaperDetail["comparison"];
  if (days < COMPARISON_MIN_DAYS) {
    comparison = { enough: false, days, requiredDays: COMPARISON_MIN_DAYS };
  } else {
    const backtestCagr = backtest?.metric?.cagr ?? null;
    const years = days / 365;
    const growth = equity !== null && equity > 0 ? equity / INITIAL_CAPITAL : null;
    const paperAnnualized = growth !== null && years > 0 ? (growth ** (1 / years) - 1) * 100 : null;
    comparison = {
      enough: true,
      backtestCagr,
      paperAnnualized,
      diffPp:
        backtestCagr !== null && paperAnnualized !== null ? paperAnnualized - backtestCagr : null,
    };
  }

  return {
    runId: run.id,
    days,
    startedAt: startedAt.toISOString(),
    curveFrom: curveFrom?.toISOString() ?? null,
    equity,
    returnPct: equity === null ? null : ((equity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100,
    positions: positionsOf(run.paper?.state, now),
    metrics: {
      mdd: run.metric?.mdd ?? null,
      sharpe: run.metric?.sharpe ?? null,
      trades: run.metric?.trades ?? 0,
      winRate: run.metric?.winRate ?? null,
      profitFactor: run.metric?.profitFactor ?? null,
      avgHoldHours: run.metric?.avgHoldHours ?? null,
      maxConsecutiveLoss: maxStreak,
      funding,
    },
    recent: recent.map((t) => ({
      exitAt: (t.exitAt as Date).toISOString(),
      symbol: t.symbol,
      side: t.side,
      pnlPct: t.pnlPct,
      holdHours: ((t.exitAt as Date).getTime() - t.entryAt.getTime()) / 3_600_000,
      exitReason: t.exitReason,
    })),
    comparison,
  };
}
