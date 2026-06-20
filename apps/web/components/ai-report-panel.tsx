import type { DailyReportResponse, WeeklyReportResponse } from "@fomo/shared";

import { formatCurrency, formatPercent } from "../lib/format";

interface AiReportPanelProps {
  dailyReport: DailyReportResponse;
  weeklyReport: WeeklyReportResponse;
}

export function AiReportPanel({ dailyReport, weeklyReport }: AiReportPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">AI report loop</p>
          <h2>Today&apos;s readout</h2>
        </div>
        <span className="pill muted">{dailyReport.report.provider}</span>
      </div>

      <div className="reason-block">
        <h3>{dailyReport.report.summary.headline}</h3>
        <p>{dailyReport.report.summary.body}</p>
        <div className="feed-meta">
          <span>Today {formatCurrency(dailyReport.metrics.netPnl)}</span>
          <span>Fees {formatCurrency(dailyReport.metrics.totalFees)}</span>
          <span>Win {formatPercent(dailyReport.metrics.winRate)}</span>
          <span>7d {formatCurrency(weeklyReport.metrics.netPnl)}</span>
        </div>
      </div>

      <div className="report-strip">
        {weeklyReport.dailySeries.map((point) => (
          <article className="report-strip-card" key={point.date}>
            <strong>{point.date.slice(5)}</strong>
            <span className={point.netPnl >= 0 ? "positive-text" : "negative-text"}>{formatCurrency(point.netPnl)}</span>
            <small>{point.tradeCount} trades</small>
          </article>
        ))}
      </div>

      <div className="report-grid">
        <div className="reason-block">
          <h3>Profit drivers</h3>
          {dailyReport.report.profitDrivers.length === 0 ? <p className="empty">No profit drivers yet.</p> : null}
          {dailyReport.report.profitDrivers.map((driver) => (
            <div className="report-line" key={`${driver.category}-${driver.key}`}>
              <strong>{driver.label}</strong>
              <span className="pill positive">{formatCurrency(driver.netPnl)}</span>
              <p>{driver.detail}</p>
            </div>
          ))}
        </div>

        <div className="reason-block">
          <h3>Loss drivers</h3>
          {dailyReport.report.lossDrivers.length === 0 ? <p className="empty">No loss drivers yet.</p> : null}
          {dailyReport.report.lossDrivers.map((driver) => (
            <div className="report-line" key={`${driver.category}-${driver.key}`}>
              <strong>{driver.label}</strong>
              <span className="pill negative">{formatCurrency(driver.netPnl)}</span>
              <p>{driver.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="report-grid">
        <div className="reason-block">
          <h3>Recommendations</h3>
          <div className="stack compact">
            {dailyReport.report.recommendations.map((item) => (
              <div className="report-line" key={item.title}>
                <div className="feed-topline">
                  <strong>{item.title}</strong>
                  <span className={`pill ${item.priority === "high" ? "negative" : item.priority === "medium" ? "warning" : "muted"}`}>
                    {item.priority}
                  </span>
                </div>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="reason-block">
          <h3>Strategy insights</h3>
          <div className="stack compact">
            {dailyReport.report.strategyInsights.map((item) => (
              <div className="report-line" key={item.key}>
                <div className="feed-topline">
                  <strong>{item.label}</strong>
                  <span className={item.netPnl >= 0 ? "pill positive" : "pill negative"}>{formatCurrency(item.netPnl)}</span>
                </div>
                <p>{item.detail}</p>
                <div className="feed-meta">
                  <span>Win {formatPercent(item.winRate)}</span>
                  <span>Trades {item.tradeCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
