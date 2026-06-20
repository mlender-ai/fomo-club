import type {
  FeeModelView,
  LogView,
  PositionView,
  StrategySessionView,
  StrategyView,
  SystemStatusView,
  TradeView
} from "@fomo/shared";

import { formatCompactDate, formatCurrency } from "../lib/format";

interface StateBoardProps {
  currentSession: StrategySessionView | null;
  strategy: StrategyView | null;
  feeModel: FeeModelView;
  featuredPosition: PositionView | null;
  latestTrade: TradeView | null;
  system: SystemStatusView;
  logs: LogView[];
}

function formatCompactValue(value: number, digits = 4) {
  return value.toFixed(digits);
}

export function StateBoard({
  currentSession,
  strategy,
  feeModel,
  featuredPosition,
  latestTrade,
  system,
  logs
}: StateBoardProps) {
  const logRows = logs.slice(0, 3);

  return (
    <section className="console-state-grid">
      <article className="console-panel">
        <div className="panel-topline">
          <span className="panel-label">READOUT</span>
          <span className="status-line-inline">MODE PAPER ONLY</span>
        </div>
        <div className="data-matrix">
          <div className="data-block">
            <span className="data-key">RUN</span>
            <strong>{currentSession?.runLabel ?? "PENDING"}</strong>
          </div>
          <div className="data-block">
            <span className="data-key">NET</span>
            <strong className={currentSession && currentSession.netPnl >= 0 ? "positive-text" : "negative-text"}>
              {formatCurrency(currentSession?.netPnl ?? 0)}
            </strong>
          </div>
          <div className="data-block">
            <span className="data-key">FEES</span>
            <strong>{formatCurrency(currentSession?.totalFees ?? 0)}</strong>
          </div>
          <div className="data-block">
            <span className="data-key">SLIP</span>
            <strong>{feeModel.slippageBps.toFixed(1)} BPS</strong>
          </div>
          <div className="data-block">
            <span className="data-key">ENTRY</span>
            <strong>{(feeModel.entryOrderRole ?? "TAKER").toUpperCase()}</strong>
          </div>
          <div className="data-block">
            <span className="data-key">R/T</span>
            <strong>{feeModel.estimatedRoundTripCostPct.toFixed(3)}%</strong>
          </div>
        </div>
        <div className="status-line">SESSION START {formatCompactDate(currentSession?.startedAt ?? null)}</div>
      </article>

      <article className="console-panel">
        <div className="panel-topline">
          <span className="panel-label">STATE</span>
          <span className={`state-chip ${featuredPosition ? "positive-text" : "muted-text"}`}>
            {featuredPosition ? "OPEN LONG" : "FLAT"}
          </span>
        </div>
        <div className="state-card">
          <div className="state-headline">
            <strong>{featuredPosition?.symbol ?? strategy?.symbol ?? "BTCUSDT"}</strong>
            <span>{strategy?.timeframe.toUpperCase() ?? "1M"}</span>
          </div>
          <div className="data-matrix compact">
            <div className="data-block">
              <span className="data-key">SIZE</span>
              <strong>{featuredPosition ? formatCompactValue(featuredPosition.quantity) : "0.0000"}</strong>
            </div>
            <div className="data-block">
              <span className="data-key">ENTRY</span>
              <strong>{formatCurrency(featuredPosition?.entryPrice ?? 0)}</strong>
            </div>
            <div className="data-block">
              <span className="data-key">MARK</span>
              <strong>{formatCurrency(featuredPosition?.currentPrice ?? featuredPosition?.entryPrice ?? 0)}</strong>
            </div>
            <div className="data-block">
              <span className="data-key">UPNL</span>
              <strong className={(featuredPosition?.unrealizedPnl ?? 0) >= 0 ? "positive-text" : "negative-text"}>
                {formatCurrency(featuredPosition?.unrealizedPnl ?? 0)}
              </strong>
            </div>
            <div className="data-block">
              <span className="data-key">REAL</span>
              <strong>{formatCurrency(featuredPosition?.realizedPnl ?? 0)}</strong>
            </div>
            <div className="data-block">
              <span className="data-key">FEE</span>
              <strong>{formatCurrency(featuredPosition?.feesPaid ?? 0)}</strong>
            </div>
          </div>
        </div>
        <div className="status-line">{strategy?.name ?? "NO STRATEGY CONFIGURED"}</div>
      </article>

      <article className="console-panel">
        <div className="panel-topline">
          <span className="panel-label">SIGNAL</span>
          <span className="status-line-inline">{latestTrade?.reasonCode ?? "HOLD"}</span>
        </div>
        <div className="signal-stack">
          <div className="copy-block">
            <span className="copy-key">ENTRY</span>
            <p className="copy-line">{featuredPosition?.entryReasonText ?? "ENTRY SIGNAL: FLAT"}</p>
          </div>
          <div className="copy-block">
            <span className="copy-key">EXIT</span>
            <p className="copy-line">{latestTrade?.reasonText ?? "EXIT LOGIC: PENDING"}</p>
          </div>
          <div className="copy-block">
            <span className="copy-key">LAST FILL</span>
            <p className="copy-line">
              {latestTrade
                ? `${latestTrade.symbol} ${latestTrade.action} ${formatCompactDate(latestTrade.executedAt)}`
                : "NO EXECUTION YET"}
            </p>
          </div>
        </div>
      </article>

      <article className="console-panel">
        <div className="panel-topline">
          <span className="panel-label">LIVE</span>
          <span className={system.workerHealthy ? "positive-text" : "negative-text"}>
            {system.workerHealthy ? "SYNC" : "STALE"}
          </span>
        </div>
        <div className="live-grid">
          <div className="data-block">
            <span className="data-key">BOT</span>
            <strong>{system.botStatus}</strong>
          </div>
          <div className="data-block">
            <span className="data-key">BEAT</span>
            <strong>{formatCompactDate(system.lastHeartbeatAt)}</strong>
          </div>
          <div className="data-block">
            <span className="data-key">ERR</span>
            <strong>{system.lastErrorAt ? formatCompactDate(system.lastErrorAt) : "CLEAR"}</strong>
          </div>
        </div>
        <div className="log-stack">
          {logRows.length === 0 ? <div className="status-line">LIVE LOG: PENDING</div> : null}
          {logRows.map((log) => (
            <article className="log-mini" key={log.id}>
              <span className={`log-level ${log.level === "ERROR" ? "negative-text" : log.level === "WARN" ? "warning-text" : "positive-text"}`}>
                {log.level}
              </span>
              <div>
                <strong>{log.source}</strong>
                <p>{log.message}</p>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
