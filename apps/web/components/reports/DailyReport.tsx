"use client";

import type { DailyReportResponse } from "@fomo/shared";

import { buildDailyAiSummary, getReasonLabel, translateRecommendation } from "../../lib/console-copy";
import { formatCurrency, formatPercent, formatSignedCurrency } from "../../lib/format";

interface DailyReportProps {
  report: DailyReportResponse;
}

export function DailyReport({ report }: DailyReportProps) {
  const profitDriver = report.report.profitDrivers[0] ?? null;
  const lossDriver = report.report.lossDrivers[0] ?? null;
  const recommendations = report.report.recommendations.slice(0, 2).map((row) => translateRecommendation(row.title, row.detail));

  return (
    <div className="report-grid">
      <article className="surface">
        <div className="surface-head">
          <div>
            <span className="surface-kicker">일간 리포트</span>
            <h2 className="panel-title">{report.date || "오늘"}</h2>
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
            <span>거래 횟수</span>
            <strong>{report.metrics.tradeCount}</strong>
          </div>
          <div>
            <span>승률</span>
            <strong>{formatPercent(report.metrics.winRate)}</strong>
          </div>
        </div>
        <div className="line-stack">
          <div className="line-card">
            <span className="line-label">AI 인사이트</span>
            <p>{buildDailyAiSummary(report)}</p>
          </div>
        </div>
      </article>

      <article className="surface">
        <div className="surface-head">
          <div>
            <span className="surface-kicker">수익/손실 분석</span>
            <h2 className="panel-title">주요 이유</h2>
          </div>
        </div>
        <div className="meta-table">
          <div className="meta-row multi">
            <div>
              <span>수익 이유</span>
              <small>{profitDriver?.detail ?? "데이터 없음"}</small>
            </div>
            <strong className="value-positive">{profitDriver ? getReasonLabel(profitDriver.key, profitDriver.label) : "없음"}</strong>
          </div>
          <div className="meta-row multi">
            <div>
              <span>손실 이유</span>
              <small>{lossDriver?.detail ?? "데이터 없음"}</small>
            </div>
            <strong className="value-negative">{lossDriver ? getReasonLabel(lossDriver.key, lossDriver.label) : "없음"}</strong>
          </div>
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
