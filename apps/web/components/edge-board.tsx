import type { DailyReportResponse, SessionCompareResponse, WeeklyReportResponse } from "@fomo/shared";

import { formatCurrency, formatPercent } from "../lib/format";

interface EdgeBoardProps {
  dailyReport: DailyReportResponse;
  weeklyReport: WeeklyReportResponse;
  sessionCompare: SessionCompareResponse;
}

function seriesHeight(value: number, maxAbs: number) {
  if (maxAbs === 0) {
    return 18;
  }

  return Math.max(12, Math.round((Math.abs(value) / maxAbs) * 44));
}

export function EdgeBoard({ dailyReport, weeklyReport, sessionCompare }: EdgeBoardProps) {
  const insights = dailyReport.report.insights.slice(0, 2);
  const recommendations = dailyReport.report.recommendations.slice(0, 2);
  const profitDriver = dailyReport.report.profitDrivers[0] ?? null;
  const lossDriver = dailyReport.report.lossDrivers[0] ?? null;
  const strategyInsight = dailyReport.report.strategyInsights[0] ?? null;
  const sessionRows = sessionCompare.comparisons.slice(0, 2);
  const maxAbs = Math.max(...weeklyReport.dailySeries.map((point) => Math.abs(point.netPnl)), 0);

  return (
    <aside className="console-edge-grid">
      <article className="console-panel edge-panel">
        <div className="panel-topline">
          <span className="panel-label">EDGE</span>
          <span className="status-line-inline">{dailyReport.report.provider.toUpperCase()}</span>
        </div>
        <div className="edge-head">
          <strong>{dailyReport.report.summary.headline}</strong>
          <p>{dailyReport.report.summary.body}</p>
        </div>
        <div className="series-strip">
          {weeklyReport.dailySeries.map((point) => (
            <div className="series-slot" key={point.date}>
              <span className={point.netPnl >= 0 ? "positive-text" : "negative-text"}>{point.date.slice(5)}</span>
              <div className="series-track">
                <div
                  className={`series-bar ${point.netPnl >= 0 ? "series-positive" : "series-negative"}`}
                  style={{ height: `${seriesHeight(point.netPnl, maxAbs)}px` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="insight-grid">
          {insights.length === 0 ? <span className="status-line">AI REPORT: INSUFFICIENT DATA</span> : null}
          {insights.map((insight) => (
            <div className="insight-row" key={insight.title}>
              <span className={`insight-tone ${insight.tone}`}>{insight.title}</span>
              <p>{insight.detail}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="console-panel">
        <div className="panel-topline">
          <span className="panel-label">SESSION</span>
          <span className="status-line-inline">{sessionCompare.baselineSession?.runLabel ?? "PENDING"}</span>
        </div>
        <div className="session-grid">
          {sessionRows.length === 0 ? <span className="status-line">SESSION COMPARE: PENDING</span> : null}
          {sessionRows.map((row) => (
            <article className="session-row" key={row.session.id}>
              <div className="session-main">
                <strong>{row.session.runLabel}</strong>
                <span>{formatCurrency(row.metrics.netPnl)}</span>
              </div>
              <div className="session-meta">
                <span>WIN {formatPercent(row.metrics.winRate)}</span>
                <span className={row.deltaNetPnl >= 0 ? "positive-text" : "negative-text"}>
                  DELTA {formatCurrency(row.deltaNetPnl)}
                </span>
                <span>FEES {formatCurrency(row.metrics.totalFees)}</span>
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="console-panel">
        <div className="panel-topline">
          <span className="panel-label">RISK</span>
          <span className="status-line-inline">7D {formatCurrency(weeklyReport.metrics.netPnl)}</span>
        </div>
        <div className="risk-grid">
          <div className="risk-block">
            <span className="copy-key">PROFIT</span>
            <strong className="positive-text">{profitDriver ? profitDriver.label : "PENDING"}</strong>
            <p>{profitDriver ? profitDriver.detail : "NO PROFIT DRIVER YET"}</p>
          </div>
          <div className="risk-block">
            <span className="copy-key">LOSS</span>
            <strong className="negative-text">{lossDriver ? lossDriver.label : "PENDING"}</strong>
            <p>{lossDriver ? lossDriver.detail : "NO LOSS DRIVER YET"}</p>
          </div>
        </div>
        <div className="recommend-list">
          {recommendations.length === 0 ? <span className="status-line">AI REPORT: INSUFFICIENT DATA</span> : null}
          {recommendations.map((item) => (
            <div className="recommend-row" key={item.title}>
              <span className={`priority-tag priority-${item.priority}`}>{item.priority}</span>
              <p>
                <strong>{item.title}</strong> {item.detail}
              </p>
            </div>
          ))}
        </div>
        <div className="status-line">
          {strategyInsight
            ? `STRAT ${strategyInsight.label} | WIN ${formatPercent(strategyInsight.winRate)} | TRADES ${strategyInsight.tradeCount}`
            : "STRATEGY INSIGHT: PENDING"}
        </div>
      </article>
    </aside>
  );
}
