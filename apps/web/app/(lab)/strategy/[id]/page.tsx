/**
 * LAB-05 PART F — 전략 상세.
 *
 * 자산곡선 + 지표 8개 + 거래 이력. **여기까지다** —
 * 로그·격자·히스토그램은 나중이다(하지 말 것 5).
 */
import Link from "next/link";

import { EquityCurve } from "../../../../components/lab/EquityCurve";
import {
  readBenchmarkCurve,
  readCurve,
  readStrategyDetail,
} from "../../../../lib/lab/backtest-board";

export const dynamic = "force-dynamic";

function pct(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function sign(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "up" : "down";
}

function hold(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 48) return `${hours.toFixed(1)}시간`;
  return `${(hours / 24).toFixed(1)}일`;
}

export default async function StrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await readStrategyDetail(id);

  if (!detail) {
    return (
      <>
        <h1 className="lab-title">
          전략 <span className="num">{id}</span>
        </h1>
        <div className="lab-empty">
          <p className="lab-empty-msg">이 전략의 백테스트 결과가 없습니다.</p>
        </div>
      </>
    );
  }

  const curve = await readCurve(detail.runId);
  const benchmarkCurve = await readBenchmarkCurve(curve.from, curve.to);
  const m = detail.metrics;

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title is-name">
          {detail.label}
          {detail.stopped ? <span className="lab-tag">종료</span> : null}
        </h1>
        <nav className="lab-periods">
          <Link href="/" className="lab-period">
            ← 백테스트
          </Link>
        </nav>
      </div>
      {detail.stopped && detail.stopReason ? (
        <p className="lab-subline">종료 사유: {detail.stopReason}</p>
      ) : null}

      <section className="lab-curve-block">
        <EquityCurve
          strategy={curve}
          strategyLabel={detail.label}
          benchmark={benchmarkCurve}
          benchmarkLabel="BTC 보유"
        />
      </section>

      <dl className="lab-stats">
        <div>
          <dt>CAGR</dt>
          <dd className={`num ${sign(m.cagr)}`}>{pct(m.cagr)}</dd>
        </div>
        <div>
          <dt>MDD</dt>
          <dd className={`num ${sign(m.mdd)}`}>{pct(m.mdd)}</dd>
        </div>
        <div>
          <dt>샤프</dt>
          <dd className="num">{m.sharpe === null ? "—" : m.sharpe.toFixed(2)}</dd>
        </div>
        <div>
          <dt>손익비</dt>
          <dd className="num">{m.profitFactor === null ? "—" : m.profitFactor.toFixed(2)}</dd>
        </div>
        <div>
          <dt>거래</dt>
          <dd className="num">{m.trades}회</dd>
        </div>
        <div>
          <dt>승률</dt>
          <dd className="num">{m.winRate === null ? "—" : `${m.winRate.toFixed(0)}%`}</dd>
        </div>
        <div>
          <dt>평균보유</dt>
          <dd className="num">{hold(m.avgHoldHours)}</dd>
        </div>
        <div>
          <dt>최대연속손실</dt>
          <dd className="num">{m.maxConsecutiveLoss}회</dd>
        </div>
      </dl>

      <p className="section-kicker" style={{ marginBottom: 8 }}>거래 이력</p>
      {detail.trades.length === 0 ? (
        <p className="lab-empty-msg">거래가 없습니다.</p>
      ) : (
        <table className="lab-board">
          <thead>
            <tr>
              <th>진입</th>
              <th>청산</th>
              <th>수익률</th>
              <th>보유</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody>
            {detail.trades.map((trade, i) => (
              <tr key={`${trade.entryAt.toISOString()}-${i}`}>
                <td className="num">{trade.entryAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="num">
                  {trade.exitAt ? trade.exitAt.toISOString().slice(0, 16).replace("T", " ") : "보유중"}
                </td>
                <td className={`num ${sign(trade.pnlPct)}`}>{pct(trade.pnlPct, 2)}</td>
                <td className="num">{hold(trade.holdHours)}</td>
                <td className="num">{trade.exitReason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detail.trades.length >= 50 ? (
        <p className="lab-empty-note">최근 50건만 보여준다.</p>
      ) : null}
    </>
  );
}
