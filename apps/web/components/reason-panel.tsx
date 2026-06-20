import type { PositionView, TradeView } from "@fomo/shared";

import { formatDate } from "../lib/format";

interface ReasonPanelProps {
  latestTrade: TradeView | null;
  featuredPosition: PositionView | null;
}

export function ReasonPanel({ latestTrade, featuredPosition }: ReasonPanelProps) {
  return (
    <section className="panel reason-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Decision trace</p>
          <h2>Why the bot moved</h2>
        </div>
      </div>
      <div className="reason-block">
        <h3>Latest exit or fill</h3>
        {latestTrade ? (
          <>
            <p className="reason-title">
              {latestTrade.symbol} · {latestTrade.action}
            </p>
            <p>{latestTrade.reasonText}</p>
            <small>{formatDate(latestTrade.executedAt)}</small>
          </>
        ) : (
          <p className="empty">No exit signal yet.</p>
        )}
      </div>
      <div className="reason-block">
        <h3>Current entry thesis</h3>
        {featuredPosition ? (
          <>
            <p className="reason-title">{featuredPosition.symbol}</p>
            <p>{featuredPosition.entryReasonText}</p>
            <small>{formatDate(featuredPosition.openedAt)}</small>
          </>
        ) : (
          <p className="empty">No open position currently.</p>
        )}
      </div>
    </section>
  );
}

