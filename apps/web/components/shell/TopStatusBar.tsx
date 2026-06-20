"use client";

import type { RuntimeStateResponse, StrategyView } from "@fomo/shared";

import { getActionStatusLabel, getConnectionStatusLabel, getStrategyStatusLabel } from "../../lib/console-copy";
import { formatCompactDate } from "../../lib/format";

interface TopStatusBarProps {
  currentStrategy: StrategyView | null;
  onOpenSidebar: () => void;
  runtime: RuntimeStateResponse;
  title: string;
  subtitle: string;
}

export function TopStatusBar({ currentStrategy, onOpenSidebar, runtime, title, subtitle }: TopStatusBarProps) {
  return (
    <header className="top-status-bar">
      <button aria-label="사이드바 열기" className="nav-toggle" onClick={onOpenSidebar} type="button">
        <span />
        <span />
        <span />
      </button>

      <div className="top-status-copy">
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>

      <div className="top-status-pills">
        <span className="top-pill top-pill-primary">현재 전략 {currentStrategy?.code ?? "-"}</span>
        <span className="top-pill top-pill-primary">상태 {getStrategyStatusLabel(currentStrategy?.status)}</span>
        <span className={`top-pill top-pill-primary ${runtime.killSwitch.enabled ? "negative" : "positive"}`}>행동 {getActionStatusLabel(runtime.system.currentAction)}</span>
        <span className="top-pill top-pill-secondary">API {getConnectionStatusLabel(runtime.system.apiStatus)}</span>
        <span className="top-pill top-pill-tertiary">WORKER {getConnectionStatusLabel(runtime.system.workerStatus)}</span>
        <span className="top-pill top-pill-tertiary">MARKET {getConnectionStatusLabel(runtime.system.marketDataStatus)}</span>
        <span className="top-pill top-pill-tertiary">업데이트 {formatCompactDate(runtime.system.lastApiUpdateAt)}</span>
        <details className="top-status-more">
          <summary className="top-pill">상태 더보기</summary>
          <div className="top-status-more-panel">
            <span className="top-pill">API {getConnectionStatusLabel(runtime.system.apiStatus)}</span>
            <span className="top-pill">WORKER {getConnectionStatusLabel(runtime.system.workerStatus)}</span>
            <span className="top-pill">MARKET {getConnectionStatusLabel(runtime.system.marketDataStatus)}</span>
            <span className="top-pill">업데이트 {formatCompactDate(runtime.system.lastApiUpdateAt)}</span>
          </div>
        </details>
      </div>
    </header>
  );
}
