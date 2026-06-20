import type { PerformanceBreakdownView, ReportMetricsView, StrategySessionView } from "@fomo/shared";

interface BreakdownRow {
  realizedPnl: number;
  feesPaid: number;
}

interface TradeMetricRow {
  realizedPnl: number;
  grossPnl: number;
  fee: number;
}

interface PositionMetricRow {
  realizedPnl: number;
}

interface SessionRecordLike {
  id: string;
  name: string;
  runLabel: string;
  status: StrategySessionView["status"];
  startedAt: Date;
  endedAt: Date | null;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function toPercent(wins: number, total: number): number {
  return total === 0 ? 0 : Number(((wins / total) * 100).toFixed(1));
}

export function buildPerformanceBreakdown<T extends BreakdownRow>(
  rows: T[],
  resolveKey: (row: T) => string,
  resolveLabel: (row: T) => string
): PerformanceBreakdownView[] {
  const grouped = new Map<
    string,
    {
      label: string;
      tradeCount: number;
      winCount: number;
      lossCount: number;
      netPnl: number;
      totalFees: number;
      grossProfit: number;
      grossLoss: number;
    }
  >();

  for (const row of rows) {
    const key = resolveKey(row);
    const current = grouped.get(key) ?? {
      label: resolveLabel(row),
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      netPnl: 0,
      totalFees: 0,
      grossProfit: 0,
      grossLoss: 0
    };

    current.tradeCount += 1;
    current.netPnl += row.realizedPnl;
    current.totalFees += row.feesPaid;

    if (row.realizedPnl > 0) {
      current.winCount += 1;
      current.grossProfit += row.realizedPnl;
    } else if (row.realizedPnl < 0) {
      current.lossCount += 1;
      current.grossLoss += row.realizedPnl;
    }

    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      tradeCount: value.tradeCount,
      winCount: value.winCount,
      lossCount: value.lossCount,
      winRate: toPercent(value.winCount, value.tradeCount),
      netPnl: round(value.netPnl),
      totalFees: round(value.totalFees),
      grossProfit: round(value.grossProfit),
      grossLoss: round(value.grossLoss),
      avgNetPnl: value.tradeCount === 0 ? 0 : round(value.netPnl / value.tradeCount),
      expectancy: value.tradeCount === 0 ? 0 : round(value.netPnl / value.tradeCount)
    }))
    .sort((left, right) => right.netPnl - left.netPnl);
}

export function mergePerformanceBreakdowns(groups: PerformanceBreakdownView[][]): PerformanceBreakdownView[] {
  const merged = new Map<string, PerformanceBreakdownView>();

  for (const group of groups) {
    for (const row of group) {
      const current = merged.get(row.key) ?? {
        key: row.key,
        label: row.label,
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        netPnl: 0,
        totalFees: 0,
        grossProfit: 0,
        grossLoss: 0,
        avgNetPnl: 0,
        expectancy: 0
      };

      current.tradeCount += row.tradeCount;
      current.winCount += row.winCount;
      current.lossCount += row.lossCount;
      current.netPnl += row.netPnl;
      current.totalFees += row.totalFees;
      current.grossProfit += row.grossProfit;
      current.grossLoss += row.grossLoss;

      merged.set(row.key, current);
    }
  }

  return [...merged.values()]
    .map((row) => ({
      ...row,
      winRate: toPercent(row.winCount, row.tradeCount),
      netPnl: round(row.netPnl),
      totalFees: round(row.totalFees),
      grossProfit: round(row.grossProfit),
      grossLoss: round(row.grossLoss),
      avgNetPnl: row.tradeCount === 0 ? 0 : round(row.netPnl / row.tradeCount),
      expectancy: row.tradeCount === 0 ? 0 : round(row.netPnl / row.tradeCount)
    }))
    .sort((left, right) => right.netPnl - left.netPnl);
}

export function buildReportMetrics(trades: TradeMetricRow[], closedPositions: PositionMetricRow[]): ReportMetricsView {
  const tradeCount = trades.length;
  const closedPositionCount = closedPositions.length;
  const netPnl = trades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const grossPnl = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const totalFees = trades.reduce((sum, trade) => sum + trade.fee, 0);
  const winningPositions = closedPositions.filter((position) => position.realizedPnl > 0);
  const losingPositions = closedPositions.filter((position) => position.realizedPnl < 0);
  const totalWinningPnl = winningPositions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const totalLosingPnl = losingPositions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const bestTrade = closedPositionCount === 0 ? 0 : Math.max(...closedPositions.map((position) => position.realizedPnl));
  const worstTrade = closedPositionCount === 0 ? 0 : Math.min(...closedPositions.map((position) => position.realizedPnl));

  return {
    tradeCount,
    closedPositionCount,
    winCount: winningPositions.length,
    lossCount: losingPositions.length,
    winRate: toPercent(winningPositions.length, closedPositionCount),
    grossPnl: round(grossPnl),
    netPnl: round(netPnl),
    totalFees: round(totalFees),
    totalWinningPnl: round(totalWinningPnl),
    totalLosingPnl: round(totalLosingPnl),
    avgNetPnlPerTrade: tradeCount === 0 ? 0 : round(netPnl / tradeCount),
    avgWin: winningPositions.length === 0 ? 0 : round(totalWinningPnl / winningPositions.length),
    avgLoss: losingPositions.length === 0 ? 0 : round(totalLosingPnl / losingPositions.length),
    bestTrade: round(bestTrade),
    worstTrade: round(worstTrade),
    expectancy: closedPositionCount === 0 ? 0 : round(netPnl / closedPositionCount)
  };
}

export function mergeReportMetrics(metricsRows: ReportMetricsView[]): ReportMetricsView {
  const aggregate = metricsRows.reduce<ReportMetricsView>(
    (sum, row) => ({
      tradeCount: sum.tradeCount + row.tradeCount,
      closedPositionCount: sum.closedPositionCount + row.closedPositionCount,
      winCount: sum.winCount + row.winCount,
      lossCount: sum.lossCount + row.lossCount,
      winRate: 0,
      grossPnl: sum.grossPnl + row.grossPnl,
      netPnl: sum.netPnl + row.netPnl,
      totalFees: sum.totalFees + row.totalFees,
      totalWinningPnl: sum.totalWinningPnl + row.totalWinningPnl,
      totalLosingPnl: sum.totalLosingPnl + row.totalLosingPnl,
      avgNetPnlPerTrade: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade:
        sum.closedPositionCount === 0
          ? row.bestTrade
          : row.closedPositionCount === 0
            ? sum.bestTrade
            : Math.max(sum.bestTrade, row.bestTrade),
      worstTrade:
        sum.closedPositionCount === 0
          ? row.worstTrade
          : row.closedPositionCount === 0
            ? sum.worstTrade
            : Math.min(sum.worstTrade, row.worstTrade),
      expectancy: 0
    }),
    {
      tradeCount: 0,
      closedPositionCount: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      grossPnl: 0,
      netPnl: 0,
      totalFees: 0,
      totalWinningPnl: 0,
      totalLosingPnl: 0,
      avgNetPnlPerTrade: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      expectancy: 0
    }
  );

  return {
    ...aggregate,
    winRate: toPercent(aggregate.winCount, aggregate.closedPositionCount),
    grossPnl: round(aggregate.grossPnl),
    netPnl: round(aggregate.netPnl),
    totalFees: round(aggregate.totalFees),
    totalWinningPnl: round(aggregate.totalWinningPnl),
    totalLosingPnl: round(aggregate.totalLosingPnl),
    avgNetPnlPerTrade: aggregate.tradeCount === 0 ? 0 : round(aggregate.netPnl / aggregate.tradeCount),
    avgWin: aggregate.winCount === 0 ? 0 : round(aggregate.totalWinningPnl / aggregate.winCount),
    avgLoss: aggregate.lossCount === 0 ? 0 : round(aggregate.totalLosingPnl / aggregate.lossCount),
    bestTrade: round(aggregate.bestTrade),
    worstTrade: round(aggregate.worstTrade),
    expectancy: aggregate.closedPositionCount === 0 ? 0 : round(aggregate.netPnl / aggregate.closedPositionCount)
  };
}

export function buildSessionViews(
  sessions: SessionRecordLike[],
  sessionMetrics: Map<string, ReportMetricsView>,
  currentSessionId: string | null
): StrategySessionView[] {
  return sessions.map((session) => {
    const metrics = sessionMetrics.get(session.id);

    return {
      id: session.id,
      name: session.name,
      runLabel: session.runLabel,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      netPnl: metrics?.netPnl ?? 0,
      totalFees: metrics?.totalFees ?? 0,
      tradeCount: metrics?.tradeCount ?? 0,
      isCurrent: session.id === currentSessionId
    };
  });
}

export function coercePerformanceBreakdowns(value: unknown): PerformanceBreakdownView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      key: String(row.key ?? "UNKNOWN"),
      label: String(row.label ?? "Unknown"),
      tradeCount: Number(row.tradeCount ?? 0),
      winCount: Number(row.winCount ?? 0),
      lossCount: Number(row.lossCount ?? 0),
      winRate: Number(row.winRate ?? 0),
      netPnl: Number(row.netPnl ?? 0),
      totalFees: Number(row.totalFees ?? 0),
      grossProfit: Number(row.grossProfit ?? 0),
      grossLoss: Number(row.grossLoss ?? 0),
      avgNetPnl: Number(row.avgNetPnl ?? 0),
      expectancy: Number(row.expectancy ?? 0)
    }));
}
