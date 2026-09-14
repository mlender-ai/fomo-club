/**
 * 전략 상세.
 *
 * | | |
 * |---|---|
 * | LAB-05 PART F | 백테스트 — 자산곡선 + 지표 8개 + 거래 이력 |
 * | LAB-08 PART B | 페이퍼 — 지금 얼마고, 무엇을 들고 있고, 백테스트와 얼마나 다른가 |
 *
 * 페이퍼를 **위에** 둔다. 지금 돌아가는 것이 먼저다. 백테스트는 그 아래 참고다.
 *
 * ## 보여주지 않는 것 (LAB-08 B-2)
 *
 * 목표가·손절선·청산 조건. 보유 포지션은 `toLivePosition` 을 거쳐 오므로 애초에
 * 그 칸이 없다. 청산 **후** 의 `exitReason` 은 결과라서 보여준다.
 */
import Link from "next/link";

import { EquityCurve } from "../../../../components/lab/EquityCurve";
import {
  readBenchmarkCurve,
  readCurve,
  readStrategyDetail,
} from "../../../../lib/lab/backtest-board";
import { INITIAL_CAPITAL, readPaperDetail, type PaperDetail } from "../../../../lib/lab/live-board";
import { prisma } from "../../../../lib/prisma";

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

function money(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function stamp(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/** "N일째" — 시작한 날이 1일째다. 화면 어디서나 **같은 셈**을 쓴다. */
function dayCount(days: number): number {
  return Math.floor(days) + 1;
}

/** 가격. 자리수는 종목마다 다르므로 소수 둘째 자리까지만 본다 — 전광판은 눈으로 읽는 화면이다. */
function price(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** B-1 — 백테스트 대비. **기간이 짧으면 숫자를 내지 않는다.** */
function Comparison({ comparison }: { comparison: PaperDetail["comparison"] }) {
  if (!comparison.enough) {
    return (
      <p className="lab-empty-note">
        표본 부족 — 페이퍼 {dayCount(comparison.days)}일째다. {comparison.requiredDays}일이
        지나기 전에는 백테스트와 비교하지 않는다. 며칠치를 연 환산하면 숫자가 혼자 커진다.
      </p>
    );
  }
  return (
    <p className="lab-subline">
      백테스트 CAGR <span className={`num ${sign(comparison.backtestCagr)}`}>{pct(comparison.backtestCagr)}</span>
      {" · "}
      페이퍼 연환산{" "}
      <span className={`num ${sign(comparison.paperAnnualized)}`}>{pct(comparison.paperAnnualized)}</span>
      {comparison.diffPp === null ? null : (
        <>
          {" · 차이 "}
          <span className={`num ${sign(comparison.diffPp)}`}>
            {comparison.diffPp > 0 ? "+" : ""}
            {comparison.diffPp.toFixed(1)}%p
          </span>
        </>
      )}
    </p>
  );
}

async function PaperSection({ detail }: { detail: PaperDetail }) {
  const curve = await readCurve(detail.runId);
  const benchmark = await readBenchmarkCurve(curve.from, curve.to);
  const m = detail.metrics;

  return (
    <section>
      <p className="section-kicker">페이퍼</p>
      <p className="lab-headline">
        <span className="num">{money(detail.equity)}</span>{" "}
        <span className={`num ${sign(detail.returnPct)}`}>{pct(detail.returnPct, 2)}</span>{" "}
        <span className="lab-muted">
          · {dayCount(detail.days)}일째 · 시작 {money(INITIAL_CAPITAL)}
        </span>
      </p>

      {/* 둘 다 0% 에서 시작한다 — 시작점이 다르면 비교가 아니다. */}
      <div className="lab-curve-block">
        <EquityCurve
          strategy={curve}
          strategyLabel="페이퍼"
          benchmark={benchmark}
          benchmarkLabel="BTC 보유"
        />
      </div>
      {detail.curveFrom && detail.curveFrom < detail.startedAt ? (
        <p className="lab-empty-note">
          곡선 앞부분({detail.curveFrom.slice(0, 10)} ~ {detail.startedAt.slice(0, 10)})은 첫 실행
          때 과거 봉을 재생한 워밍업이다 — 그때 실제로 돌고 있던 것이 아니다. 운용 일수에는 세지
          않는다.
        </p>
      ) : null}

      <dl className="lab-stats">
        <div>
          <dt>MDD</dt>
          <dd className={`num ${sign(m.mdd)}`}>{pct(m.mdd)}</dd>
        </div>
        <div>
          <dt>샤프</dt>
          <dd className="num">{m.sharpe === null ? "—" : m.sharpe.toFixed(2)}</dd>
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
          <dt>손익비</dt>
          <dd className="num">{m.profitFactor === null ? "—" : m.profitFactor.toFixed(2)}</dd>
        </div>
        <div>
          <dt>평균보유</dt>
          <dd className="num">{hold(m.avgHoldHours)}</dd>
        </div>
        <div>
          <dt>최대연속손실</dt>
          <dd className="num">{m.maxConsecutiveLoss}회</dd>
        </div>
        <div>
          <dt>펀딩비 누적</dt>
          {/* 낸 것이 양수다. 수익률에서 이미 빠져 있고, 여기서는 얼마였는지만 본다. */}
          <dd className="num">{m.funding === 0 ? "$0" : `-$${m.funding.toFixed(2)}`}</dd>
        </div>
      </dl>

      <p className="section-kicker">보유 중</p>
      {detail.positions.length === 0 ? (
        <p className="lab-empty-note">들고 있는 것이 없다.</p>
      ) : (
        <div className="lab-board-scroll">
          <table className="lab-board">
            <thead>
              <tr>
                <th>종목</th>
                <th>방향</th>
                <th>진입가</th>
                <th>평가손익</th>
                <th>보유</th>
              </tr>
            </thead>
            <tbody>
              {detail.positions.map((position) => (
                <tr key={`${position.symbol}-${position.entryPrice}`}>
                  <td>{position.symbol}</td>
                  <td>{position.side === "LONG" ? "롱" : "숏"}</td>
                  <td className="num">{price(position.entryPrice)}</td>
                  <td className={`num ${sign(position.pnlPct)}`}>{pct(position.pnlPct, 2)}</td>
                  <td className="num">{hold(position.heldHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* 평가손익의 기준가는 **마지막으로 받은 봉의 종가**다. 실시간 호가가 아니다. */}
          <p className="lab-empty-note">
            평가손익은 마지막으로 받은 봉 기준이다 — 실시간 호가가 아니다.
          </p>
        </div>
      )}

      <p className="section-kicker">최근 거래</p>
      {detail.recent.length === 0 ? (
        <p className="lab-empty-note">청산된 거래가 아직 없다.</p>
      ) : (
        <div className="lab-board-scroll">
          <table className="lab-board">
            <thead>
              <tr>
                <th>청산</th>
                <th>종목</th>
                <th>수익률</th>
                <th>보유</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {detail.recent.map((trade) => (
                <tr key={`${trade.exitAt}-${trade.symbol}`}>
                  <td className="num">{stamp(trade.exitAt)}</td>
                  <td>{trade.symbol}</td>
                  <td className={`num ${sign(trade.pnlPct)}`}>{pct(trade.pnlPct, 2)}</td>
                  <td className="num">{hold(trade.holdHours)}</td>
                  <td className="num">{trade.exitReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="section-kicker">백테스트 대비</p>
      <Comparison comparison={detail.comparison} />
    </section>
  );
}

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [strategy, paper, detail] = await Promise.all([
    prisma.strategy.findUnique({
      where: { id },
      select: { name: true, version: true, status: true, stopReason: true },
    }),
    readPaperDetail(id),
    readStrategyDetail(id),
  ]);

  if (!strategy) {
    return (
      <>
        <h1 className="lab-title">
          전략 <span className="num">{id}</span>
        </h1>
        <div className="lab-empty">
          <p className="lab-empty-msg">그런 전략이 없습니다.</p>
        </div>
      </>
    );
  }

  const label = `${strategy.name} v${strategy.version}`;
  const stopped = strategy.status === "STOPPED";

  const backtestCurve = detail ? await readCurve(detail.runId) : null;
  const backtestBenchmark = backtestCurve
    ? await readBenchmarkCurve(backtestCurve.from, backtestCurve.to)
    : null;

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title is-name">
          <span className={`lab-dot ${stopped ? "is-off" : "is-on"}`} aria-hidden>
            {stopped ? "○" : "●"}
          </span>{" "}
          {label}
          {stopped ? <span className="lab-tag">정지</span> : null}
        </h1>
        <nav className="lab-periods">
          <Link href="/live" className="lab-period">
            ← 전광판
          </Link>
          <Link href="/" className="lab-period">
            백테스트
          </Link>
        </nav>
      </div>
      {stopped && strategy.stopReason ? (
        <p className="lab-warning">정지 사유: {strategy.stopReason}</p>
      ) : null}

      {paper ? (
        <PaperSection detail={paper} />
      ) : (
        <p className="lab-empty-note">페이퍼가 아직 시작되지 않았다.</p>
      )}

      {detail && backtestCurve ? (
        <section>
          <p className="section-kicker">백테스트</p>
          <div className="lab-curve-block">
            <EquityCurve
              strategy={backtestCurve}
              strategyLabel={label}
              benchmark={backtestBenchmark ?? { segments: [], min: 0, max: 0, from: null, to: null }}
              benchmarkLabel="BTC 보유"
            />
          </div>

          <dl className="lab-stats">
            <div>
              <dt>CAGR</dt>
              <dd className={`num ${sign(detail.metrics.cagr)}`}>{pct(detail.metrics.cagr)}</dd>
            </div>
            <div>
              <dt>MDD</dt>
              <dd className={`num ${sign(detail.metrics.mdd)}`}>{pct(detail.metrics.mdd)}</dd>
            </div>
            <div>
              <dt>샤프</dt>
              <dd className="num">
                {detail.metrics.sharpe === null ? "—" : detail.metrics.sharpe.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>손익비</dt>
              <dd className="num">
                {detail.metrics.profitFactor === null
                  ? "—"
                  : detail.metrics.profitFactor.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>거래</dt>
              <dd className="num">{detail.metrics.trades}회</dd>
            </div>
            <div>
              <dt>승률</dt>
              <dd className="num">
                {detail.metrics.winRate === null ? "—" : `${detail.metrics.winRate.toFixed(0)}%`}
              </dd>
            </div>
            <div>
              <dt>평균보유</dt>
              <dd className="num">{hold(detail.metrics.avgHoldHours)}</dd>
            </div>
            <div>
              <dt>최대연속손실</dt>
              <dd className="num">{detail.metrics.maxConsecutiveLoss}회</dd>
            </div>
          </dl>

          <p className="section-kicker">거래 이력</p>
          {detail.trades.length === 0 ? (
            <p className="lab-empty-note">거래가 없습니다.</p>
          ) : (
            <div className="lab-board-scroll">
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
                      <td className="num">
                        {trade.entryAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="num">
                        {trade.exitAt
                          ? trade.exitAt.toISOString().slice(0, 16).replace("T", " ")
                          : "보유중"}
                      </td>
                      <td className={`num ${sign(trade.pnlPct)}`}>{pct(trade.pnlPct, 2)}</td>
                      <td className="num">{hold(trade.holdHours)}</td>
                      <td className="num">{trade.exitReason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detail.trades.length >= 50 ? (
            <p className="lab-empty-note">최근 50건만 보여준다.</p>
          ) : null}
        </section>
      ) : (
        <p className="lab-empty-note">백테스트 결과가 없다.</p>
      )}
    </>
  );
}
