"use client";

import type { DashboardSummaryResponse, RuntimeStateResponse, SessionCompareResponse, StrategyControlResponse, StrategyView } from "@fomo/shared";

import { getConnectionStatusLabel, getStrategyStatusLabel } from "../../lib/console-copy";
import { formatCompactDate, formatCurrency, formatPercent, formatSignedCurrency } from "../../lib/format";

interface StrategyDetailProps {
  dashboard: DashboardSummaryResponse;
  runtime: RuntimeStateResponse;
  selectedStrategy: StrategyView | null;
  sessionCompare: SessionCompareResponse;
  strategyControl: StrategyControlResponse;
}

function renderConfigSummary(strategy: StrategyView | null): Array<{ label: string; value: string }> {
  if (!strategy) {
    return [];
  }

  return [
    { label: "BB", value: `${strategy.config.bbPeriod}/${strategy.config.bbStdDev}` },
    { label: "RSI", value: `${strategy.config.rsiPeriod}/${strategy.config.entryRsiFloor}` },
    { label: "최소 변동성", value: `${strategy.config.minVolatilityPct.toFixed(2)}%` },
    { label: "기대 배수", value: `${strategy.config.expectedProfitMultiple.toFixed(1)}x` }
  ];
}

export function StrategyDetail({ dashboard, runtime, selectedStrategy, sessionCompare, strategyControl }: StrategyDetailProps) {
  const selectedSession = dashboard.currentSession;
  const comparison =
    sessionCompare.comparisons.find((row) => row.session.id === selectedSession?.id) ?? sessionCompare.comparisons[0] ?? null;
  const row = selectedStrategy
    ? strategyControl.performanceByPeriod.all.find((item) => item.strategyId === selectedStrategy.id) ?? null
    : null;

  return (
    <article className="surface detail-surface">
      <div className="surface-head">
        <div>
          <span className="surface-kicker">전략 상세</span>
          <h2 className="panel-title">{selectedStrategy ? `${selectedStrategy.code} · ${selectedStrategy.name}` : "선택된 전략 없음"}</h2>
        </div>
        <span className="surface-meta">{selectedStrategy ? getStrategyStatusLabel(selectedStrategy.status) : "-"}</span>
      </div>

      {selectedStrategy ? (
        <>
          <div className="definition-grid definition-grid-wide">
            <div>
              <span>현재 상태</span>
              <strong>{getStrategyStatusLabel(selectedStrategy.status)}</strong>
            </div>
            <div>
              <span>실행 엔진</span>
              <strong>{selectedStrategy.key}</strong>
            </div>
            <div>
              <span>전략별 손익</span>
              <strong className={(row?.netPnl ?? 0) >= 0 ? "value-positive" : "value-negative"}>{formatSignedCurrency(row?.netPnl ?? 0)}</strong>
            </div>
            <div>
              <span>승률</span>
              <strong>{formatPercent(row?.winRate ?? 0)}</strong>
            </div>
            <div>
              <span>현재 자본 기여</span>
              <strong>{formatCurrency(row?.equity ?? runtime.account.initialCapital)}</strong>
            </div>
            <div>
              <span>마켓 상태</span>
              <strong>{getConnectionStatusLabel(runtime.system.marketDataStatus)}</strong>
            </div>
          </div>

          <div className="line-stack">
            <div className="line-card">
              <span className="line-label">전략 설명</span>
              <p>{selectedStrategy.description}</p>
            </div>
            <div className="line-card">
              <span className="line-label">활성 세션</span>
              <p>{selectedSession ? `${selectedSession.runLabel} · ${formatCompactDate(selectedSession.startedAt)}` : "활성 세션 없음"}</p>
            </div>
            <div className="line-card">
              <span className="line-label">세션 비교</span>
              <p>
                {comparison
                  ? `기준 대비 순손익 ${formatSignedCurrency(comparison.deltaNetPnl)}, 기대값 ${comparison.deltaExpectancy.toFixed(2)}`
                  : "비교 가능한 세션 없음"}
              </p>
            </div>
          </div>

          <div className="meta-table">
            <div className="meta-table-head">파라미터 요약</div>
            {renderConfigSummary(selectedStrategy).map((item) => (
              <div className="meta-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            <div className="meta-row">
              <span>할당 비중</span>
              <strong>{(selectedStrategy.allocationPct * 100).toFixed(1)}%</strong>
            </div>
            <div className="meta-row">
              <span>최근 평가 시각</span>
              <strong>{formatCompactDate(selectedStrategy.lastEvaluatedAt)}</strong>
            </div>
          </div>
        </>
      ) : (
        <div className="status-note">선택된 전략이 없습니다.</div>
      )}
    </article>
  );
}
