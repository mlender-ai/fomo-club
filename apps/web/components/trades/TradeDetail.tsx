"use client";

import type { TradeView } from "@fomo/shared";

import { getActionLabel, getReasonLabel, getReasonText, getSessionNameKorean } from "../../lib/console-copy";
import { formatCompactDate, formatCurrency, formatSignedCurrency } from "../../lib/format";

interface TradeDetailProps {
  trade: TradeView | null;
}

export function TradeDetail({ trade }: TradeDetailProps) {
  const reasonMetaRows = Object.entries(trade?.reasonMeta ?? {});

  return (
    <article className="surface detail-surface">
      <div className="surface-head">
        <div>
          <span className="surface-kicker">상세</span>
          <h2 className="panel-title">{trade ? `${trade.symbol} ${getActionLabel(trade.action)}` : "선택된 거래 없음"}</h2>
        </div>
        <span className="surface-meta">{trade ? formatCompactDate(trade.executedAt) : "--"}</span>
      </div>

      {trade ? (
        <>
          <div className="definition-grid definition-grid-wide">
            <div>
              <span>체결가</span>
              <strong>{formatCurrency(trade.price)}</strong>
            </div>
            <div>
              <span>수량</span>
              <strong>{trade.quantity.toFixed(4)}</strong>
            </div>
            <div>
              <span>실현 손익</span>
              <strong className={trade.realizedPnl >= 0 ? "value-positive" : "value-negative"}>
                {formatSignedCurrency(trade.realizedPnl)}
              </strong>
            </div>
            <div>
              <span>수수료</span>
              <strong>{formatCurrency(trade.fee)}</strong>
            </div>
            <div>
              <span>진입/청산 이유</span>
              <strong>{getReasonLabel(trade.reasonCode)}</strong>
            </div>
            <div>
              <span>슬리피지</span>
              <strong>{trade.slippageBps.toFixed(1)} bps</strong>
            </div>
          </div>

          <div className="line-stack">
            <div className="line-card">
              <span className="line-label">사유 설명</span>
              <p>{getReasonText(trade.reasonCode, trade.reasonText)}</p>
            </div>
            <div className="line-card">
              <span className="line-label">세션</span>
              <p>{getSessionNameKorean(trade.sessionName)}</p>
            </div>
          </div>

          <div className="meta-table">
            <div className="meta-table-head">구조화된 사유 데이터</div>
            {reasonMetaRows.length === 0 ? <div className="status-note">저장된 reasonMeta가 없습니다.</div> : null}
            {reasonMetaRows.map(([key, value]) => (
              <div className="meta-row" key={key}>
                <span>{key}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="status-note">선택할 거래가 없습니다.</div>
      )}
    </article>
  );
}
