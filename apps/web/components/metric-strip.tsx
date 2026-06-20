import type { DashboardMetrics, FeeModelView, PositionView } from "@fomo/shared";

import { formatCurrency, formatPercent } from "../lib/format";

interface MetricStripProps {
  summary: DashboardMetrics;
  feeModel: FeeModelView;
  featuredPosition: PositionView | null;
}

interface MetricCell {
  key: string;
  label: string;
  value: string;
  meta: string;
  tone?: "positive" | "negative" | "neutral";
}

export function MetricStrip({ summary, feeModel, featuredPosition }: MetricStripProps) {
  const metrics: MetricCell[] = [
    {
      key: "net",
      label: "NET",
      value: formatCurrency(summary.todayNetPnl),
      meta: `TOTAL ${formatCurrency(summary.totalNetPnl)}`,
      tone: summary.todayNetPnl >= 0 ? "positive" : "negative"
    },
    {
      key: "fees",
      label: "FEES",
      value: formatCurrency(summary.todayFees),
      meta: `TOTAL ${formatCurrency(summary.totalFees)}`,
      tone: "negative"
    },
    {
      key: "trades",
      label: "TRADES",
      value: summary.todayTradeCount.toString(),
      meta: `R/T ${feeModel.estimatedRoundTripCostPct.toFixed(3)}%`
    },
    {
      key: "win",
      label: "WIN",
      value: formatPercent(summary.winRate),
      meta: `OPEN ${summary.openPositionCount}`
    },
    {
      key: "open",
      label: "OPEN",
      value: summary.openPositionCount.toString(),
      meta: featuredPosition ? `${featuredPosition.symbol} ${featuredPosition.side}` : "FLAT"
    },
    {
      key: "equity",
      label: "EQUITY",
      value: formatCurrency(summary.totalEquity),
      meta: `CASH ${formatCurrency(summary.cashBalance)}`,
      tone: summary.totalEquity >= summary.cashBalance ? "positive" : "neutral"
    }
  ];

  return (
    <section className="metric-strip" aria-label="Metrics">
      {metrics.map((metric) => (
        <article className={`metric-cell metric-${metric.tone ?? "neutral"}`} key={metric.key}>
          <div className="metric-topline">
            <span className="metric-code">{metric.label}</span>
            <span className="metric-meta">{metric.meta}</span>
          </div>
          <strong className="metric-readout">{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}
