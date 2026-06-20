"use client";

import type { DailyReportResponse, DashboardSummaryResponse, RuntimeStateResponse } from "@fomo/shared";

import {
  buildAgentRecommendationBullets,
  buildAgentStateLabel,
  buildEntryReasonBullets,
  buildRiskBullets,
  getActionStatusLabel,
  getStrategyStatusLabel
} from "../../lib/console-copy";
import { formatCurrency, formatSignedCurrency } from "../../lib/format";

interface AgentSummaryProps {
  dashboard: DashboardSummaryResponse;
  dailyReport: DailyReportResponse;
  runtime: RuntimeStateResponse;
}

export function AgentSummary({ dashboard, dailyReport, runtime }: AgentSummaryProps) {
  const strategy = dashboard.strategies.find((item) => item.isPrimary) ?? dashboard.strategies[0] ?? null;
  const position = dashboard.openPositions[0] ?? null;
  const latestTrade = dashboard.recentTrades[0] ?? null;
  const entryBullets = buildEntryReasonBullets(position, latestTrade).slice(0, 3);
  const riskBullets = buildRiskBullets(dailyReport, position, runtime).slice(0, 3);
  const recommendations = buildAgentRecommendationBullets(dailyReport).slice(0, 2);

  return (
    <section className="agent-summary">
      <div className="agent-pnl-block">
        <span>오늘 순손익</span>
        <strong className={dashboard.summary.todayNetPnl >= 0 ? "value-positive" : "value-negative"}>
          {formatSignedCurrency(dashboard.summary.todayNetPnl)}
        </strong>
      </div>

      <div className="agent-action-row">
        <div className="agent-action-pill">
          <span>지금 행동</span>
          <strong>{getActionStatusLabel(runtime.system.currentAction)}</strong>
        </div>
        <div className="agent-mini-state">
          <span>현재 상태</span>
          <strong>{buildAgentStateLabel(position, runtime)}</strong>
        </div>
        <div className="agent-mini-state">
          <span>전략 상태</span>
          <strong>{strategy ? `${strategy.code} / ${getStrategyStatusLabel(strategy.status)}` : "전략 없음"}</strong>
        </div>
      </div>

      <div className="agent-kpi-line">
        <span>수수료 {formatCurrency(dashboard.summary.todayFees)}</span>
        <span>거래 {dashboard.summary.todayTradeCount}회</span>
        <span>포지션 {dashboard.summary.openPositionCount}</span>
        <span>자본 {formatCurrency(dashboard.account.equity)}</span>
      </div>

      <div className="agent-bullet-grid">
        <article className="agent-section">
          <span className="agent-section-label">진입 근거</span>
          <ul className="agent-bullet-list">
            {entryBullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="agent-section">
          <span className="agent-section-label">리스크</span>
          <ul className="agent-bullet-list">
            {riskBullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="agent-section">
          <span className="agent-section-label">AI 제안</span>
          <ul className="agent-bullet-list">
            {(recommendations.length > 0 ? recommendations : ["전략 유지 관찰"]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
