import type {
  AiReportPayload,
  PerformanceBreakdownView,
  ReportDriverView,
  ReportInsightView,
  ReportRecommendationView,
  StrategyInsightView
} from "@fomo/shared";

import type { DailyReportInput, ReportGeneratorProvider, SessionCompareInput, WeeklyReportInput } from "./types.js";

function pickTopPositive(rows: PerformanceBreakdownView[], count: number): PerformanceBreakdownView[] {
  return rows.filter((row) => row.netPnl > 0).sort((left, right) => right.netPnl - left.netPnl).slice(0, count);
}

function pickTopNegative(rows: PerformanceBreakdownView[], count: number): PerformanceBreakdownView[] {
  return rows.filter((row) => row.netPnl < 0).sort((left, right) => left.netPnl - right.netPnl).slice(0, count);
}

function toDriver(category: ReportDriverView["category"], row: PerformanceBreakdownView): ReportDriverView {
  const winLabel = row.tradeCount === 0 ? "no closes" : `${row.winCount}/${row.tradeCount} wins`;

  return {
    key: row.key,
    label: row.label,
    category,
    netPnl: row.netPnl,
    tradeCount: row.tradeCount,
    detail: `${winLabel}, avg ${row.avgNetPnl.toFixed(2)} net, fees ${row.totalFees.toFixed(2)}`
  };
}

function toStrategyInsights(rows: PerformanceBreakdownView[]): StrategyInsightView[] {
  return rows.slice(0, 3).map((row) => ({
    key: row.key,
    label: row.label,
    detail:
      row.netPnl >= 0
        ? `Net profit remained positive with ${row.winRate.toFixed(1)}% win rate across ${row.tradeCount} trades.`
        : `Net result stayed negative; average expectancy is ${row.expectancy.toFixed(2)} per trade.`,
    netPnl: row.netPnl,
    winRate: row.winRate,
    tradeCount: row.tradeCount
  }));
}

function buildHeadline(netPnl: number, totalFees: number): string {
  if (netPnl > 0 && netPnl > totalFees) {
    return "Edge stayed above fee drag";
  }

  if (netPnl > 0) {
    return "Profit is positive, but friction is still heavy";
  }

  if (netPnl === 0) {
    return "Session is flat and still in observation mode";
  }

  if (Math.abs(netPnl) < totalFees) {
    return "Losses are concentrated in trading friction";
  }

  return "Losses are coming from signal quality, not only fees";
}

function buildCommonInsights(input: {
  netPnl: number;
  tradeCount: number;
  winRate: number;
  totalFees: number;
  expectancy: number;
  bestTrade: number;
  worstTrade: number;
  topProfitDriver: ReportDriverView | undefined;
  topLossDriver: ReportDriverView | undefined;
}): ReportInsightView[] {
  const insights: ReportInsightView[] = [
    {
      title: "Net result",
      detail: `Net PnL ${input.netPnl.toFixed(2)} across ${input.tradeCount} trades with ${input.winRate.toFixed(1)}% win rate.`,
      tone: input.netPnl >= 0 ? "positive" : "negative"
    },
    {
      title: "Fee pressure",
      detail: `Total fees were ${input.totalFees.toFixed(2)} and expectancy was ${input.expectancy.toFixed(2)} per closed trade.`,
      tone: input.totalFees > Math.abs(input.netPnl) ? "negative" : "neutral"
    }
  ];

  if (input.topProfitDriver) {
    insights.push({
      title: "Primary profit driver",
      detail: `${input.topProfitDriver.label} contributed ${input.topProfitDriver.netPnl.toFixed(2)} net.`,
      tone: "positive"
    });
  }

  if (input.topLossDriver) {
    insights.push({
      title: "Primary loss driver",
      detail: `${input.topLossDriver.label} dragged ${input.topLossDriver.netPnl.toFixed(2)} net.`,
      tone: "negative"
    });
  }

  insights.push({
    title: "Trade spread",
    detail: `Best close was ${input.bestTrade.toFixed(2)} and worst close was ${input.worstTrade.toFixed(2)}.`,
    tone: input.bestTrade >= Math.abs(input.worstTrade) ? "neutral" : "negative"
  });

  return insights.slice(0, 4);
}

function buildRecommendations(input: {
  netPnl: number;
  totalFees: number;
  tradeCount: number;
  winRate: number;
  expectancy: number;
  topLossDriver: ReportDriverView | undefined;
}): ReportRecommendationView[] {
  const recommendations: ReportRecommendationView[] = [];

  if (input.tradeCount > 0 && input.totalFees >= Math.max(input.netPnl, 0)) {
    recommendations.push({
      title: "Keep the fee filter strict",
      detail: "Fee drag is still large relative to realized edge. Do not relax the minimum expected-profit filter yet.",
      priority: "high"
    });
  }

  if (input.winRate < 50 || input.expectancy < 0) {
    recommendations.push({
      title: "Review weak entry windows",
      detail: "The current setup is not producing enough positive expectancy. Prefer fewer entries over more frequency.",
      priority: "high"
    });
  }

  if (input.topLossDriver) {
    recommendations.push({
      title: `Audit ${input.topLossDriver.label}`,
      detail: "Check the candles and filters around this reason before changing parameters. The objective is diagnosis, not auto-retuning.",
      priority: "medium"
    });
  }

  if (input.tradeCount < 4) {
    recommendations.push({
      title: "Collect more observations",
      detail: "The sample is still small. Keep the strategy fixed longer before changing thresholds.",
      priority: "low"
    });
  }

  return recommendations.slice(0, 3);
}

function buildPayload(input: {
  provider: string;
  headline: string;
  body: string;
  insights: ReportInsightView[];
  recommendations: ReportRecommendationView[];
  profitDrivers: ReportDriverView[];
  lossDrivers: ReportDriverView[];
  strategyInsights: StrategyInsightView[];
}): AiReportPayload {
  return {
    provider: input.provider,
    generatedAt: new Date().toISOString(),
    summary: {
      headline: input.headline,
      body: input.body
    },
    insights: input.insights,
    recommendations: input.recommendations,
    profitDrivers: input.profitDrivers,
    lossDrivers: input.lossDrivers,
    strategyInsights: input.strategyInsights
  };
}

export class RuleBasedReportProvider implements ReportGeneratorProvider {
  readonly name = "rule-based";

  generateDaily(input: DailyReportInput): AiReportPayload {
    const profitDrivers = [
      ...pickTopPositive(input.entryReasonPerformance, 1).map((row) => toDriver("entry", row)),
      ...pickTopPositive(input.exitReasonPerformance, 1).map((row) => toDriver("exit", row))
    ];
    const lossDrivers = [
      ...pickTopNegative(input.entryReasonPerformance, 1).map((row) => toDriver("entry", row)),
      ...pickTopNegative(input.exitReasonPerformance, 1).map((row) => toDriver("exit", row))
    ];
    const headline = buildHeadline(input.metrics.netPnl, input.metrics.totalFees);
    const body = `${input.date} report for ${input.session?.runLabel ?? "current scope"}: net ${input.metrics.netPnl.toFixed(2)}, fees ${input.metrics.totalFees.toFixed(2)}, win rate ${input.metrics.winRate.toFixed(1)}%.`;

    return buildPayload({
      provider: this.name,
      headline,
      body,
      insights: buildCommonInsights({
        netPnl: input.metrics.netPnl,
        tradeCount: input.metrics.tradeCount,
        winRate: input.metrics.winRate,
        totalFees: input.metrics.totalFees,
        expectancy: input.metrics.expectancy,
        bestTrade: input.metrics.bestTrade,
        worstTrade: input.metrics.worstTrade,
        topProfitDriver: profitDrivers[0],
        topLossDriver: lossDrivers[0]
      }),
      recommendations: buildRecommendations({
        netPnl: input.metrics.netPnl,
        totalFees: input.metrics.totalFees,
        tradeCount: input.metrics.tradeCount,
        winRate: input.metrics.winRate,
        expectancy: input.metrics.expectancy,
        topLossDriver: lossDrivers[0]
      }),
      profitDrivers,
      lossDrivers,
      strategyInsights: toStrategyInsights(input.strategyPerformance)
    });
  }

  generateWeekly(input: WeeklyReportInput): AiReportPayload {
    const profitDrivers = [
      ...pickTopPositive(input.entryReasonPerformance, 1).map((row) => toDriver("entry", row)),
      ...pickTopPositive(input.exitReasonPerformance, 1).map((row) => toDriver("exit", row)),
      ...pickTopPositive(input.strategyPerformance, 1).map((row) => toDriver("strategy", row))
    ];
    const lossDrivers = [
      ...pickTopNegative(input.entryReasonPerformance, 1).map((row) => toDriver("entry", row)),
      ...pickTopNegative(input.exitReasonPerformance, 1).map((row) => toDriver("exit", row))
    ];
    const headline = buildHeadline(input.metrics.netPnl, input.metrics.totalFees);
    const body = `${input.periodStart} to ${input.periodEnd}: net ${input.metrics.netPnl.toFixed(2)} across ${input.metrics.closedPositionCount} closed positions and ${input.metrics.tradeCount} executions.`;

    return buildPayload({
      provider: this.name,
      headline,
      body,
      insights: buildCommonInsights({
        netPnl: input.metrics.netPnl,
        tradeCount: input.metrics.tradeCount,
        winRate: input.metrics.winRate,
        totalFees: input.metrics.totalFees,
        expectancy: input.metrics.expectancy,
        bestTrade: input.metrics.bestTrade,
        worstTrade: input.metrics.worstTrade,
        topProfitDriver: profitDrivers[0],
        topLossDriver: lossDrivers[0]
      }),
      recommendations: buildRecommendations({
        netPnl: input.metrics.netPnl,
        totalFees: input.metrics.totalFees,
        tradeCount: input.metrics.tradeCount,
        winRate: input.metrics.winRate,
        expectancy: input.metrics.expectancy,
        topLossDriver: lossDrivers[0]
      }),
      profitDrivers,
      lossDrivers,
      strategyInsights: toStrategyInsights(input.strategyPerformance)
    });
  }

  generateSessionCompare(input: SessionCompareInput): AiReportPayload {
    const leader = input.comparisons[0];
    const laggard = [...input.comparisons].sort((left, right) => left.deltaNetPnl - right.deltaNetPnl)[0];
    const headline =
      leader && leader.deltaNetPnl > 0 ? "Current session is outperforming the baseline" : "Current session has not cleared the baseline yet";
    const body = input.currentSession
      ? `${input.currentSession.runLabel} is being compared against ${input.baselineSession?.runLabel ?? "recent history"} across ${input.comparisons.length} sessions.`
      : "No active session is available for comparison.";
    const profitDrivers =
      leader?.topEntryReason || leader?.topExitReason
        ? [toDriver(leader.topEntryReason ? "entry" : "exit", leader.topEntryReason ?? leader.topExitReason!)]
        : [];
    const lossDrivers =
      laggard?.topExitReason || laggard?.topEntryReason
        ? [toDriver(laggard.topExitReason ? "exit" : "entry", laggard.topExitReason ?? laggard.topEntryReason!)]
        : [];

    return buildPayload({
      provider: this.name,
      headline,
      body,
      insights: [
        {
          title: "Session delta",
          detail: leader
            ? `${leader.session.runLabel} moved ${leader.deltaNetPnl.toFixed(2)} net and ${leader.deltaWinRate.toFixed(1)}pp win rate versus baseline.`
            : "No comparison candidates are available yet.",
          tone: leader && leader.deltaNetPnl >= 0 ? "positive" : "neutral"
        },
        {
          title: "Expectation delta",
          detail: leader
            ? `Expectancy moved ${leader.deltaExpectancy.toFixed(2)} per close while fees changed ${leader.deltaFees.toFixed(2)}.`
            : "Waiting for more sessions before expectancy can be compared.",
          tone: leader && leader.deltaExpectancy >= 0 ? "positive" : "neutral"
        }
      ],
      recommendations: [
        {
          title: "Keep strategy fixed across sessions",
          detail: "Use the comparison table to decide what the human should test next. Do not auto-modify thresholds.",
          priority: "high"
        },
        {
          title: "Promote only clear improvements",
          detail: "Only treat a session as better if net PnL rises without a matching jump in fee burden.",
          priority: "medium"
        }
      ],
      profitDrivers,
      lossDrivers,
      strategyInsights: input.comparisons.slice(0, 3).map((row) => ({
        key: row.session.id,
        label: row.session.runLabel,
        detail: `Net ${row.metrics.netPnl.toFixed(2)}, win ${row.metrics.winRate.toFixed(1)}%, expectancy ${row.metrics.expectancy.toFixed(2)}.`,
        netPnl: row.metrics.netPnl,
        winRate: row.metrics.winRate,
        tradeCount: row.metrics.tradeCount
      }))
    });
  }
}
