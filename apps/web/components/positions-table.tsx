import type { PositionView } from "@fomo/shared";

import { formatCurrency, formatDate } from "../lib/format";

interface PositionsTableProps {
  positions: PositionView[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Open exposure</p>
          <h2>Current positions</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table className="positions-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Entry</th>
              <th>Current</th>
              <th>Unrealized</th>
              <th>Fees</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  No open positions.
                </td>
              </tr>
            ) : null}
            {positions.map((position) => (
              <tr key={position.id}>
                <td>
                  <strong>{position.symbol}</strong>
                  <p>{position.entryReasonText}</p>
                </td>
                <td>{formatCurrency(position.entryPrice)}</td>
                <td>{position.currentPrice === null ? "-" : formatCurrency(position.currentPrice)}</td>
                <td className={position.unrealizedPnl >= 0 ? "positive-text" : "negative-text"}>
                  {formatCurrency(position.unrealizedPnl)}
                </td>
                <td>{formatCurrency(position.feesPaid)}</td>
                <td>{formatDate(position.openedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
