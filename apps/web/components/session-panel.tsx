import type { FeeModelView, StrategySessionView } from "@fomo/shared";

import { formatCurrency, formatDate } from "../lib/format";

interface SessionPanelProps {
  currentSession: StrategySessionView | null;
  sessions: StrategySessionView[];
  feeModel: FeeModelView;
}

export function SessionPanel({ currentSession, sessions, feeModel }: SessionPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Validation session</p>
          <h2>Experiment scope</h2>
        </div>
      </div>

      <div className="reason-block">
        <h3>Current run</h3>
        {currentSession ? (
          <>
            <p className="reason-title">{currentSession.name}</p>
            <p>{currentSession.runLabel}</p>
            <div className="feed-meta">
              <span>Started {formatDate(currentSession.startedAt)}</span>
              <span>Net {formatCurrency(currentSession.netPnl)}</span>
              <span>Fees {formatCurrency(currentSession.totalFees)}</span>
            </div>
          </>
        ) : (
          <p className="empty">No active session.</p>
        )}
      </div>

      <div className="reason-block">
        <h3>Execution friction</h3>
        <div className="feed-meta">
          <span>Maker {(feeModel.makerFeeRate * 100).toFixed(3)}%</span>
          <span>Taker {(feeModel.takerFeeRate * 100).toFixed(3)}%</span>
          <span>Slippage {feeModel.slippageBps.toFixed(1)} bps</span>
          <span>Round-trip {feeModel.estimatedRoundTripCostPct.toFixed(3)}%</span>
        </div>
      </div>

      <div className="stack compact">
        {sessions.slice(0, 4).map((session) => (
          <article className="log-row" key={session.id}>
            <span className={`pill ${session.isCurrent ? "positive" : "muted"}`}>{session.isCurrent ? "CURRENT" : session.status}</span>
            <div>
              <strong>{session.runLabel}</strong>
              <p>
                {formatCurrency(session.netPnl)} · fees {formatCurrency(session.totalFees)} · trades {session.tradeCount}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

