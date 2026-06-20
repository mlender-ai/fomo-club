"use client";

import type { SessionCompareResponse, WeeklyReportResponse } from "@fomo/shared";

import { buildSessionCompareSummary, buildWeeklyAiSummary, translatePerformanceLabel, translateRecommendation } from "../../lib/console-copy";
import { formatCurrency, formatPercent, formatSignedCurrency } from "../../lib/format";

interface WeeklyReportProps {
  report: WeeklyReportResponse;
  sessionCompare: SessionCompareResponse;
}

export function WeeklyReport({ report, sessionCompare }: WeeklyReportProps) {
  const recommendations = report.report.recommendations.slice(0, 2).map((row) => translateRecommendation(row.title, row.detail));

  return (
    <div className="report-grid">
      <article className="surface">
        <div className="surface-head">
          <div>
            <span className="surface-kicker">주간 리포트</span>
            <h2 className="panel-title">
              {report.periodStart || "--"} ~ {report.periodEnd || "--"}
            </h2>
          </div>
        </div>
        <div className="definition-grid definition-grid-wide">
          <div>
            <span>순손익</span>
            <strong className={report.metrics.netPnl >= 0 ? "value-positive" : "value-negative"}>
              {formatSignedCurrency(report.metrics.netPnl)}
            </strong>
          </div>
          <div>
            <span>총 수수료</span>
            <strong>{formatCurrency(report.metrics.totalFees)}</strong>
          </div>
          <div>
            <span>체결 수</span>
            <strong>{report.metrics.tradeCount}</strong>
          </div>
          <div>
            <span>기대값</span>
            <strong>{report.metrics.expectancy.toFixed(2)}</strong>
          </div>
        </div>
        <div className="line-stack">
          <div className="line-card">
            <span className="line-label">AI 인사이트</span>
            <p>{buildWeeklyAiSummary(report)}</p>
          </div>
          <div className="line-card">
            <span className="line-label">세션 비교 요약</span>
            <p>{buildSessionCompareSummary(sessionCompare)}</p>
          </div>
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <span className="surface-kicker">전략별 성과</span>
            <h2 className="panel-title">주간 비교</h2>
          </div>
        </div>
        <div className="meta-table">
          {report.strategyPerformance.map((row) => (
            <div className="meta-row multi" key={row.key}>
              <div>
                <span>{translatePerformanceLabel(row)}</span>
                <small>
                  승률 {formatPercent(row.winRate)} · 기대값 {row.expectancy.toFixed(2)}
                </small>
              </div>
              <strong className={row.netPnl >= 0 ? "value-positive" : "value-negative"}>{formatSignedCurrency(row.netPnl)}</strong>
            </div>
          ))}
        </div>
        <div className="recommendation-list">
          {recommendations.map((recommendation) => (
            <div className="recommendation-card" key={recommendation.title}>
              <strong>{recommendation.title}</strong>
              <p>{recommendation.detail}</p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
