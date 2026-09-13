/**
 * LAB-04 PART F — 결과 지표.
 *
 * **`cagrMdd` 가 순위 기준이다**(LAB-00 §7). 수익률 순위는 레버리지가 이긴다.
 *
 * 순수 함수다. `Metric` 테이블과 1:1 이고, 여기에 `max_consecutive_loss` 가 하나 더 있다.
 */
import type { ClosedTrade, EquityPoint } from "./types";

export interface Metrics {
  cagr: number | null;
  totalReturn: number | null;
  /** 최대 낙폭(%). 음수 또는 0. */
  mdd: number | null;
  /** 수익/낙폭. **순위 기준.** */
  cagrMdd: number | null;
  sharpe: number | null;
  sortino: number | null;
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  avgHoldHours: number | null;
  maxConsecutiveLoss: number;
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: readonly number[], from: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - from) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** 봉 간격에서 연간 봉 수를 추정한다. 샤프 연율화에 쓴다. */
function periodsPerYear(equity: readonly EquityPoint[]): number | null {
  const first = equity[0];
  const second = equity[1];
  if (!first || !second) return null;
  const stepMs = second.at.getTime() - first.at.getTime();
  if (!(stepMs > 0)) return null;
  return MS_PER_YEAR / stepMs;
}

/**
 * 지표를 낸다.
 *
 * 자산곡선이 두 점 미만이면 대부분 `null` 이다 — **0 으로 채우지 않는다.**
 * 0 은 "손익이 없었다" 라는 값이고 null 은 "잴 수 없다" 다. 둘은 다르다.
 */
export function computeMetrics(
  trades: readonly ClosedTrade[],
  equity: readonly EquityPoint[],
  initialCapital: number
): Metrics {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);

  const grossWin = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

  let maxConsecutiveLoss = 0;
  let streak = 0;
  for (const trade of trades) {
    if (trade.pnl < 0) {
      streak += 1;
      maxConsecutiveLoss = Math.max(maxConsecutiveLoss, streak);
    } else {
      streak = 0;
    }
  }

  const avgHoldHours =
    trades.length === 0
      ? null
      : mean(trades.map((t) => (t.exitAt.getTime() - t.entryAt.getTime()) / 3_600_000));

  const first = equity[0];
  const last = equity[equity.length - 1];
  if (!first || !last || equity.length < 2 || !(initialCapital > 0)) {
    return {
      cagr: null,
      totalReturn: null,
      mdd: null,
      cagrMdd: null,
      sharpe: null,
      sortino: null,
      trades: trades.length,
      winRate: trades.length === 0 ? null : (wins.length / trades.length) * 100,
      profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
      avgHoldHours,
      maxConsecutiveLoss,
    };
  }

  const totalReturn = ((last.equity - initialCapital) / initialCapital) * 100;
  const years = (last.at.getTime() - first.at.getTime()) / MS_PER_YEAR;
  const growth = last.equity / initialCapital;
  // 자산이 0 이하로 가면 CAGR 이 정의되지 않는다. 파산은 수익률로 표현할 수 없다.
  const cagr = years > 0 && growth > 0 ? (growth ** (1 / years) - 1) * 100 : null;

  const mdd = Math.min(0, ...equity.map((point) => point.drawdown));

  // 봉별 수익률.
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i += 1) {
    const prev = equity[i - 1];
    const cur = equity[i];
    if (!prev || !cur || !(prev.equity > 0)) continue;
    returns.push((cur.equity - prev.equity) / prev.equity);
  }

  const ppy = periodsPerYear(equity);
  const avgReturn = mean(returns);
  const sd = stdev(returns, avgReturn);
  const sharpe = ppy && sd > 0 ? (avgReturn / sd) * Math.sqrt(ppy) : null;

  // 소르티노는 **하방 편차**만 본다. 0 을 기준으로 음수만 모은다.
  const downside = returns.filter((r) => r < 0);
  const downsideSd = downside.length >= 2 ? stdev(downside, 0) : 0;
  const sortino = ppy && downsideSd > 0 ? (avgReturn / downsideSd) * Math.sqrt(ppy) : null;

  return {
    cagr,
    totalReturn,
    mdd,
    // 낙폭이 0 이면 나눌 수 없다. **무한대를 1등으로 만들지 않는다.**
    cagrMdd: cagr !== null && mdd < 0 ? cagr / Math.abs(mdd) : null,
    sharpe,
    sortino,
    trades: trades.length,
    winRate: trades.length === 0 ? null : (wins.length / trades.length) * 100,
    profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
    avgHoldHours,
    maxConsecutiveLoss,
  };
}
