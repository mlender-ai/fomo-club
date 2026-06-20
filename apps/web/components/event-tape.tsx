import type { LogView, TradeView } from "@fomo/shared";

import { formatCompactDate, formatCurrency } from "../lib/format";

interface EventTapeProps {
  trades: TradeView[];
  logs: LogView[];
}

interface TapeRow {
  id: string;
  timestamp: string;
  tone: "positive" | "negative" | "neutral";
  text: string;
}

export function EventTape({ trades, logs }: EventTapeProps) {
  const tradeRows: TapeRow[] = trades.slice(0, 4).map((trade) => ({
    id: trade.id,
    timestamp: trade.executedAt,
    tone: trade.realizedPnl > 0 ? "positive" : trade.realizedPnl < 0 ? "negative" : "neutral",
    text: `${formatCompactDate(trade.executedAt)} ${trade.symbol} ${trade.action} ${formatCurrency(trade.realizedPnl)} ${trade.reasonCode}`
  }));

  const logRows: TapeRow[] = logs.slice(0, 4).map((log) => ({
    id: log.id,
    timestamp: log.createdAt,
    tone: log.level === "ERROR" ? "negative" : log.level === "WARN" ? "neutral" : "positive",
    text: `${formatCompactDate(log.createdAt)} ${log.source.toUpperCase()} ${log.message}`
  }));

  const items = [...tradeRows, ...logRows]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 8);

  return (
    <footer className="console-tape" aria-label="Event tape">
      <span className="panel-label">TAPE</span>
      <div className="tape-track">
        {items.length === 0 ? <span className="status-line">TAPE: NO EVENTS</span> : null}
        {items.map((item) => (
          <span className={`tape-item tape-${item.tone}`} key={item.id}>
            {item.text}
          </span>
        ))}
      </div>
    </footer>
  );
}
