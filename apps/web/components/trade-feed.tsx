import type { TradeView } from "@fomo/shared";

import { formatCurrency, formatDate } from "../lib/format";

interface TradeFeedProps {
  trades: TradeView[];
}

export function TradeFeed({ trades }: TradeFeedProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Recent trades</p>
          <h2>Execution timeline</h2>
        </div>
      </div>
      <div className="feed">
        {trades.length === 0 ? <p className="empty">No trades executed yet.</p> : null}
        {trades.map((trade) => (
          <article className="feed-item" key={trade.id}>
            <div className="feed-topline">
              <strong>
                {trade.symbol} · {trade.action}
              </strong>
              <span className={trade.realizedPnl >= 0 ? "pill positive" : "pill negative"}>
                {formatCurrency(trade.realizedPnl)}
              </span>
            </div>
            <p>{trade.reasonText}</p>
            <div className="feed-meta">
              <span>{formatCurrency(trade.price)}</span>
              <span>{trade.quantity.toFixed(4)}</span>
              <span>Fee {formatCurrency(trade.fee)}</span>
              <span>{trade.orderRole}</span>
              <span>{formatDate(trade.executedAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
