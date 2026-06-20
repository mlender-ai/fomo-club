"use client";

import type { TradeView } from "@fomo/shared";

import { getActionLabel, getReasonLabel } from "../../lib/console-copy";
import { formatCompactDate, formatSignedCurrency } from "../../lib/format";

interface TradeListProps {
  trades: TradeView[];
  selectedTradeId: string | null;
  onSelect: (tradeId: string) => void;
}

export function TradeList({ trades, selectedTradeId, onSelect }: TradeListProps) {
  return (
    <article className="surface detail-list-surface">
      <div className="surface-head">
        <div>
          <span className="surface-kicker">거래</span>
          <h2 className="panel-title">체결 로그</h2>
        </div>
        <span className="surface-meta">{trades.length}건</span>
      </div>

      <div className="select-list">
        {trades.length === 0 ? <div className="status-note">거래 내역이 없습니다.</div> : null}
        {trades.map((trade) => (
          <button
            className={`select-row ${trade.id === selectedTradeId ? "active" : ""}`}
            key={trade.id}
            onClick={() => onSelect(trade.id)}
            type="button"
          >
            <div>
              <strong>
                {trade.symbol} {getActionLabel(trade.action)}
              </strong>
              <p>{getReasonLabel(trade.reasonCode)}</p>
            </div>
            <div className="select-row-side">
              <span className={trade.realizedPnl >= 0 ? "value-positive" : "value-negative"}>
                {formatSignedCurrency(trade.realizedPnl)}
              </span>
              <small>{formatCompactDate(trade.executedAt)}</small>
            </div>
          </button>
        ))}
      </div>
    </article>
  );
}
