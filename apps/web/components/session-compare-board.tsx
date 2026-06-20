import type { SessionCompareResponse } from "@fomo/shared";

import { formatCurrency, formatPercent } from "../lib/format";

interface SessionCompareBoardProps {
  report: SessionCompareResponse;
}

function formatDelta(value: number, kind: "currency" | "percent" | "number") {
  const prefix = value > 0 ? "+" : "";

  if (kind === "currency") {
    return `${prefix}${formatCurrency(value)}`;
  }

  if (kind === "percent") {
    return `${prefix}${value.toFixed(1)}pp`;
  }

  return `${prefix}${value.toFixed(2)}`;
}

export function SessionCompareBoard({ report }: SessionCompareBoardProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Session compare</p>
          <h2>Run label review</h2>
        </div>
      </div>

      <div className="reason-block">
        <h3>{report.report.summary.headline}</h3>
        <p>{report.report.summary.body}</p>
        <div className="feed-meta">
          <span>Current {report.currentSession?.runLabel ?? "-"}</span>
          <span>Baseline {report.baselineSession?.runLabel ?? "-"}</span>
        </div>
      </div>

      <div className="stack compact">
        {report.comparisons.map((row) => (
          <article className="strategy-card" key={row.session.id}>
            <div className="feed-topline">
              <strong>{row.session.runLabel}</strong>
              <span className={row.metrics.netPnl >= 0 ? "pill positive" : "pill negative"}>
                {formatCurrency(row.metrics.netPnl)}
              </span>
            </div>
            <div className="feed-meta">
              <span>Win {formatPercent(row.metrics.winRate)}</span>
              <span>Fees {formatCurrency(row.metrics.totalFees)}</span>
              <span>Expectancy {formatCurrency(row.metrics.expectancy)}</span>
            </div>
            <div className="compare-grid">
              <div>
                <small>vs baseline net</small>
                <strong className={row.deltaNetPnl >= 0 ? "positive-text" : "negative-text"}>{formatDelta(row.deltaNetPnl, "currency")}</strong>
              </div>
              <div>
                <small>vs baseline win</small>
                <strong className={row.deltaWinRate >= 0 ? "positive-text" : "negative-text"}>{formatDelta(row.deltaWinRate, "percent")}</strong>
              </div>
              <div>
                <small>vs baseline fees</small>
                <strong className={row.deltaFees <= 0 ? "positive-text" : "negative-text"}>{formatDelta(row.deltaFees, "currency")}</strong>
              </div>
            </div>
            <p>
              Entry: {row.topEntryReason?.label ?? "No entry data"} / Exit: {row.topExitReason?.label ?? "No exit data"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
