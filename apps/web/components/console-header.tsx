import type { StrategySessionView, StrategyView, SystemStatusView } from "@fomo/shared";

interface ConsoleHeaderProps {
  currentSession: StrategySessionView | null;
  strategy: StrategyView | null;
  system: SystemStatusView;
}

function formatStrategyKey(key: string | undefined) {
  if (!key) {
    return "UNASSIGNED";
  }

  return key.replaceAll("-", " ").toUpperCase();
}

export function ConsoleHeader({ currentSession, strategy, system }: ConsoleHeaderProps) {
  return (
    <header className="console-header">
      <div className="console-ident">
        <span className="console-tag">PAPER</span>
        <span className="console-token">{strategy?.symbol ?? "BTCUSDT"}</span>
        <span className="console-token">{strategy?.timeframe.toUpperCase() ?? "1M"}</span>
        <span className="console-token muted">{formatStrategyKey(strategy?.key)}</span>
      </div>

      <div className="console-line">
        <span>SESSION {currentSession?.runLabel ?? "PENDING"}</span>
        <span>STATE {strategy?.status ?? "IDLE"}</span>
        <span className={system.workerHealthy ? "positive-text" : "negative-text"}>
          LIVE {system.workerHealthy ? "SYNC" : "STALE"}
        </span>
      </div>
    </header>
  );
}
