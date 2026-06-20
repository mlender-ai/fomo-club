"use client";

import type { AccountOverviewView, PeriodFilter, StrategyControlResponse, StrategyPerformanceRow, StrategySortKey, StrategyView } from "@fomo/shared";

import { formatCurrency, formatPercent, formatSignedCurrency } from "../../lib/format";

interface StrategyListProps {
  account: AccountOverviewView;
  execution: StrategyControlResponse["execution"];
  isMutating: boolean;
  onSelect: (strategyId: string) => void;
  onSetPrimary: (strategyId: string) => Promise<void>;
  onToggleStrategy: (strategyId: string) => Promise<void>;
  period: PeriodFilter;
  rows: StrategyPerformanceRow[];
  selectedStrategyId: string | null;
  setPeriod: (period: PeriodFilter) => void;
  setSortBy: (sortBy: StrategySortKey) => void;
  sortBy: StrategySortKey;
  strategies: StrategyView[];
}

const periodLabels: Record<PeriodFilter, string> = {
  today: "오늘",
  "7d": "7일",
  all: "전체"
};

const sortLabels: Record<StrategySortKey, string> = {
  profit: "손익순",
  winRate: "승률순"
};

export function StrategyList({
  account,
  execution,
  isMutating,
  onSelect,
  onSetPrimary,
  onToggleStrategy,
  period,
  rows,
  selectedStrategyId,
  setPeriod,
  setSortBy,
  sortBy,
  strategies
}: StrategyListProps) {
  return (
    <article className="surface detail-list-surface">
      <div className="surface-head">
        <div>
          <span className="surface-kicker">전략 운영</span>
          <h2 className="panel-title">전략별 성과</h2>
        </div>
        <span className="surface-meta">초기 자본 {formatCurrency(account.initialCapital)}</span>
      </div>

      <div className="strategy-summary-grid">
        <div className="summary-chip">
          <span>현재 자본</span>
          <strong>{formatCurrency(account.equity)}</strong>
        </div>
        <div className="summary-chip">
          <span>총 손익</span>
          <strong className={account.totalPnlUsd >= 0 ? "value-positive" : "value-negative"}>
            {formatSignedCurrency(account.totalPnlUsd)} · {formatPercent(account.totalPnlPct)}
          </strong>
        </div>
        <div className="summary-chip">
          <span>실행 방식</span>
          <strong>{execution.allowMultiStrategy ? "멀티" : "단일"}</strong>
        </div>
      </div>

      <div className="strategy-toolbar">
        <div className="segmented">
          {(Object.keys(periodLabels) as PeriodFilter[]).map((key) => (
            <button className={`segment-button ${period === key ? "active" : ""}`} key={key} onClick={() => setPeriod(key)} type="button">
              {periodLabels[key]}
            </button>
          ))}
        </div>
        <div className="segmented">
          {(Object.keys(sortLabels) as StrategySortKey[]).map((key) => (
            <button className={`segment-button ${sortBy === key ? "active" : ""}`} key={key} onClick={() => setSortBy(key)} type="button">
              {sortLabels[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="strategy-table">
        <div className="strategy-table-head">
          <span>전략</span>
          <span>손익</span>
          <span>승률</span>
          <span>거래</span>
          <span>수수료</span>
          <span>제어</span>
        </div>

        {rows.map((row) => {
          const strategy = strategies.find((item) => item.id === row.strategyId);

          return (
            <div className={`strategy-table-row ${selectedStrategyId === row.strategyId ? "active" : ""}`} key={row.strategyId}>
              <button className="strategy-table-main" onClick={() => onSelect(row.strategyId)} type="button">
                <strong>{row.code}</strong>
                <div>
                  <span>{row.name}</span>
                  <small>{strategy?.symbol ?? "-"} · {strategy?.timeframe ?? "-"}</small>
                </div>
              </button>
              <div className="strategy-table-cell" data-label="손익">
                <small className="strategy-table-cell-label">손익</small>
                <strong className={row.netPnl >= 0 ? "value-positive" : "value-negative"}>{formatSignedCurrency(row.netPnl)}</strong>
              </div>
              <div className="strategy-table-cell" data-label="승률">
                <small className="strategy-table-cell-label">승률</small>
                <strong>{formatPercent(row.winRate)}</strong>
              </div>
              <div className="strategy-table-cell" data-label="거래">
                <small className="strategy-table-cell-label">거래</small>
                <strong>{row.tradeCount}</strong>
              </div>
              <div className="strategy-table-cell" data-label="수수료">
                <small className="strategy-table-cell-label">수수료</small>
                <strong>{formatCurrency(row.totalFees)}</strong>
              </div>
              <div className="strategy-table-actions" data-label="제어">
                <small className="strategy-table-cell-label">제어</small>
                <button className={`table-action ${strategy?.isPrimary ? "active" : ""}`} disabled={isMutating} onClick={() => void onSetPrimary(row.strategyId)} type="button">
                  주력
                </button>
                <button className={`table-action ${strategy?.status === "ACTIVE" ? "active" : ""}`} disabled={isMutating} onClick={() => void onToggleStrategy(row.strategyId)} type="button">
                  {strategy?.status === "ACTIVE" ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
