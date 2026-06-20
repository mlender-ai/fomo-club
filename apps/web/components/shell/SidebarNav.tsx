"use client";

import type { MouseEvent } from "react";

import type { MarketSymbol, RuntimeStateResponse, StrategyControlResponse } from "@fomo/shared";

import type { AgentTrustMetric } from "../../lib/console-copy";
import { getActionStatusLabel, getConnectionStatusLabel, getStrategyStatusLabel } from "../../lib/console-copy";

export type NavView = "agent" | "trades" | "strategies" | "reports" | "settings";

interface SidebarNavProps {
  activeView: NavView;
  buildHref: (view: NavView, symbol: MarketSymbol) => string;
  currentSymbol: MarketSymbol;
  isMutating: boolean;
  isOpen: boolean;
  onChange: (view: NavView) => void;
  onClose: () => void;
  onSetPrimary: (strategyId: string) => void;
  onToggleStrategy: (strategyId: string) => void;
  onToggleMulti: () => void;
  onKillSwitch: (mode: "PAUSE_ONLY" | "CLOSE_POSITIONS") => void;
  runtime: RuntimeStateResponse;
  strategyControl: StrategyControlResponse;
  trustMetrics: AgentTrustMetric[];
}

const navItems: Array<{ key: NavView; label: string }> = [
  { key: "agent", label: "에이전트" },
  { key: "trades", label: "거래" },
  { key: "strategies", label: "전략" },
  { key: "reports", label: "리포트" },
  { key: "settings", label: "설정" }
];

export function SidebarNav({
  activeView,
  buildHref,
  currentSymbol,
  isMutating,
  isOpen,
  onChange,
  onClose,
  onSetPrimary,
  onToggleStrategy,
  onToggleMulti,
  onKillSwitch,
  runtime,
  strategyControl,
  trustMetrics
}: SidebarNavProps) {
  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, view: NavView) {
    event.preventDefault();
    onChange(view);
    onClose();
  }

  return (
    <aside aria-hidden={!isOpen ? undefined : false} className={`shell-sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-brand">
        <span className="sidebar-badge">{runtime.exchange.mode === "real" ? "실거래" : "모의매매"}</span>
        <div>
          <strong>AI 트레이딩 콘솔</strong>
          <p>
            {getActionStatusLabel(runtime.system.currentAction)} · {getConnectionStatusLabel(runtime.system.marketDataStatus)} ·{" "}
            {runtime.exchange.exchange}
          </p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="사이드바 네비게이션">
        {navItems.map((item) => (
          <a
            className={`sidebar-link ${activeView === item.key ? "active" : ""}`}
            href={buildHref(item.key, currentSymbol)}
            key={item.key}
            onClick={(event) => handleNavClick(event, item.key)}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-footer-label">전략 신뢰</span>
          <span className="sidebar-footer-label">today / week / all</span>
        </div>

        <div className="sidebar-trust-list">
          {trustMetrics.map((metric) => (
            <div className="sidebar-trust-row" key={metric.label}>
              <span>{metric.label}</span>
              <strong className={metric.tone === "positive" ? "value-positive" : metric.tone === "negative" ? "value-negative" : ""}>{metric.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-footer-label">전략 실행</span>
          <button className={`sidebar-chip-button ${strategyControl.execution.allowMultiStrategy ? "active" : ""}`} onClick={onToggleMulti} type="button">
            {strategyControl.execution.allowMultiStrategy ? "멀티" : "단일"}
          </button>
        </div>

        <div className="strategy-switcher">
          {strategyControl.strategies.map((strategy) => (
            <div className={`strategy-switch-row ${strategy.isPrimary ? "primary" : ""}`} key={strategy.id}>
              <button className="strategy-switch-main" onClick={() => onSetPrimary(strategy.id)} type="button">
                <strong>{strategy.code}</strong>
                <span>{strategy.name}</span>
              </button>
              <button className={`strategy-switch-toggle ${strategy.status === "ACTIVE" ? "active" : ""}`} onClick={() => onToggleStrategy(strategy.id)} type="button">
                {getStrategyStatusLabel(strategy.status)}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-section sidebar-danger">
        <span className="sidebar-footer-label">킬 스위치</span>
        <div className="kill-switch-group">
          <button className={`kill-switch-button ${runtime.killSwitch.enabled ? "active" : ""}`} disabled={isMutating} onClick={() => onKillSwitch("PAUSE_ONLY")} type="button">
            즉시 중단
          </button>
          <button className="kill-switch-button alt" disabled={isMutating} onClick={() => onKillSwitch("CLOSE_POSITIONS")} type="button">
            즉시 청산
          </button>
        </div>
        <small className="sidebar-footer-label">
          {runtime.killSwitch.enabled ? `활성 · ${runtime.killSwitch.mode}` : "비활성"}
        </small>
      </div>
    </aside>
  );
}
