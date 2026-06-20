import type { PerformanceBreakdownView } from "@fomo/shared";

import { formatCurrency, formatPercent } from "../lib/format";

interface PerformanceBoardProps {
  eyebrow: string;
  title: string;
  rows: PerformanceBreakdownView[];
  emptyText: string;
}

export function PerformanceBoard({ eyebrow, title, rows, emptyText }: PerformanceBoardProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="stack compact">
        {rows.length === 0 ? <p className="empty">{emptyText}</p> : null}
        {rows.map((row) => (
          <article className="strategy-card" key={row.key}>
            <div className="feed-topline">
              <strong>{row.label}</strong>
              <span className={row.netPnl >= 0 ? "pill positive" : "pill negative"}>{formatCurrency(row.netPnl)}</span>
            </div>
            <div className="feed-meta">
              <span>Trades {row.tradeCount}</span>
              <span>Win {formatPercent(row.winRate)}</span>
              <span>Fees {formatCurrency(row.totalFees)}</span>
              <span>Exp {formatCurrency(row.expectancy)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
