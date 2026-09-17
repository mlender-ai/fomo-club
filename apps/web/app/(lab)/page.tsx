/**
 * LAB-05 PART A — 백테스트 화면. `/` 기본 라우트.
 *
 * > **표 하나와 선 하나면 된다.**
 *
 * 지금 필요한 건 보기 좋은 화면이 아니라 **판단할 수 있는 화면**이다.
 *
 * 서버 컴포넌트다. 행 선택·기간 선택은 **URL 쿼리**로 한다 — 클라이언트 상태를
 * 두지 않으면 새로고침해도 보던 것이 그대로 있고, 링크로 남길 수 있다.
 */
import Link from "next/link";

import { EquityCurve } from "../../components/lab/EquityCurve";
import {
  MARKETS,
  MARKET_LABEL,
  PERIOD_LABEL,
  readBenchmarkCurve,
  readBoard,
  readCurve,
  type BoardRow,
  type MarketKey,
  type PeriodKey,
} from "../../lib/lab/backtest-board";
import { describeMultipleComparison } from "@fomo/lab";

export const dynamic = "force-dynamic";

const PERIODS: PeriodKey[] = ["all", "3y", "1y"];

function pct(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function num(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

/** 음수는 하락색(PART B-2). 0 은 중립이다. */
function sign(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "up" : "down";
}

/** PART E — 시장 칸. 같은 표에 서므로 어느 쪽인지 한 글자로 보여야 한다. */
const MARKET_TAG: Record<string, string> = {
  CRYPTO: "크립토",
  STOCK: "주식",
  POLYMARKET: "예측",
};

function Row({
  row,
  rank,
  selected,
  period,
  market,
  best,
}: {
  row: BoardRow;
  rank: number | null;
  selected: boolean;
  period: PeriodKey;
  market: MarketKey;
  best: boolean;
}) {
  const href = `/?period=${period}&market=${market}&run=${row.runId}`;
  return (
    <tr className={[selected ? "is-selected" : "", row.stopped ? "is-stopped" : ""].join(" ")}>
      <td className="num rank">{rank ?? ""}</td>
      <td>
        <Link href={href} className="lab-row-link" scroll={false}>
          {row.label}
        </Link>
        {row.stopped ? <span className="lab-tag">종료</span> : null}
        {!row.ranked && !row.stopped ? <span className="lab-tag">표본 부족</span> : null}
      </td>
      <td className="market">{MARKET_TAG[row.market] ?? row.market}</td>
      <td className={`num ${sign(row.cagr)}`}>{pct(row.cagr)}</td>
      <td className={`num ${sign(row.mdd)}`}>{pct(row.mdd)}</td>
      <td className={`num ${best ? "accent" : sign(row.cagrMdd)}`}>{num(row.cagrMdd)}</td>
      <td className="num">{num(row.sharpe)}</td>
      <td className="num">{row.winRate === null ? "—" : `${row.winRate.toFixed(0)}%`}</td>
      <td className="num">{row.trades}</td>
    </tr>
  );
}

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; run?: string; market?: string }>;
}) {
  const params = await searchParams;
  const period: PeriodKey = PERIODS.includes(params.period as PeriodKey)
    ? (params.period as PeriodKey)
    : "all";
  const market: MarketKey = MARKETS.includes(params.market as MarketKey)
    ? (params.market as MarketKey)
    : "all";

  const board = await readBoard(period, market);
  const all = [...board.ranked, ...board.unranked, ...board.stopped];

  if (all.length === 0) {
    return (
      <>
        <h1 className="lab-title">백테스트</h1>
        <div className="lab-empty">
          <p className="lab-empty-brand">STRATEGY LAB</p>
          <p className="lab-empty-msg">아직 백테스트 결과가 없습니다.</p>
          <p className="lab-empty-note">npm run lab:backtest -- --strategy &lt;id&gt;</p>
        </div>
      </>
    );
  }

  // 기본 선택은 1위. 없으면 첫 행.
  const selectedId = params.run && all.some((r) => r.runId === params.run)
    ? params.run
    : (board.ranked[0]?.runId ?? all[0]?.runId ?? "");
  const selected = all.find((r) => r.runId === selectedId) ?? (all[0] as BoardRow);

  const curve = await readCurve(selected.runId, board.from);
  // 벤치마크는 **전략 곡선과 같은 구간**으로 자른다. 구간이 다르면 비교가 아니다.
  const benchmarkCurve = await readBenchmarkCurve(curve.from ?? board.from, curve.to);

  const bestRunId = board.ranked[0]?.runId ?? null;

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title">백테스트</h1>
        <nav className="lab-periods">
          {MARKETS.map((key) => (
            <Link
              key={key}
              href={`/?period=${period}&market=${key}`}
              className={`lab-period ${key === market ? "is-on" : ""}`}
              scroll={false}
            >
              {MARKET_LABEL[key]}
            </Link>
          ))}
          <span className="lab-period-sep" aria-hidden />
          {PERIODS.map((key) => (
            <Link
              key={key}
              href={`/?period=${key}&market=${market}`}
              className={`lab-period ${key === period ? "is-on" : ""}`}
              scroll={false}
            >
              {PERIOD_LABEL[key]}
            </Link>
          ))}
        </nav>
      </div>

      <p className="lab-subline">
        {board.from ? board.from.toISOString().slice(0, 7) : "전체"} ~{" "}
        {board.to ? board.to.toISOString().slice(0, 7) : "—"} · 워크포워드 검증 구간 · 무레버리지
      </p>

      <div className="lab-board-scroll">
      <table className="lab-board">
        <thead>
          <tr>
            <th className="rank">순위</th>
            <th>전략</th>
            <th>시장</th>
            <th>CAGR</th>
            <th>MDD</th>
            <th>C/M</th>
            <th>샤프</th>
            <th>승률</th>
            <th>거래</th>
          </tr>
        </thead>
        <tbody>
          {board.ranked.map((row, i) => (
            <Row
              key={row.runId}
              row={row}
              rank={i + 1}
              selected={row.runId === selectedId}
              period={period}
              market={market}
              best={row.runId === bestRunId}
            />
          ))}
          {board.unranked.map((row) => (
            <Row
              key={row.runId}
              row={row}
              rank={null}
              selected={row.runId === selectedId}
              period={period}
              market={market}
              best={false}
            />
          ))}
        </tbody>

        {/* 벤치마크는 **항상 표 맨 아래**, 구분선으로 나눈다(PART B-2). */}
        <tbody className="lab-benchmark">
          {board.benchmarks.map((benchmark) => (
            <tr key={benchmark.label}>
              <td className="num rank" />
              <td>{benchmark.label}</td>
              <td className="market">—</td>
              <td className={`num ${sign(benchmark.cagr)}`}>{pct(benchmark.cagr)}</td>
              <td className={`num ${sign(benchmark.mdd)}`}>{pct(benchmark.mdd)}</td>
              <td className={`num ${sign(benchmark.cagrMdd)}`}>{num(benchmark.cagrMdd)}</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
            </tr>
          ))}
        </tbody>

        {/* 종료된 전략 — 회색, 순위 없이, 맨 아래. **진 걸 지우면 전부 거짓이 된다.** */}
        {board.stopped.length > 0 ? (
          <tbody className="lab-stopped-group">
            {board.stopped.map((row) => (
              <Row
                key={row.runId}
                row={row}
                rank={null}
                selected={row.runId === selectedId}
                period={period}
                market={market}
                best={false}
              />
            ))}
          </tbody>
        ) : null}
      </table>
      </div>

      <section className="lab-curve-block">
        <EquityCurve
          strategy={curve}
          strategyLabel={selected.label}
          benchmark={benchmarkCurve}
          benchmarkLabel={board.benchmarks[0]?.label ?? "벤치마크"}
        />
      </section>

      <p className="lab-warning">{describeMultipleComparison(board.comparison)}</p>
      {board.comparison.excludedForSample > 0 ? (
        <p className="lab-empty-note">
          표본 30건 미만 {board.comparison.excludedForSample}개는 순위와 검정에서 뺐다.
        </p>
      ) : null}

      <p className="lab-empty-note">
        행을 누르면 자산곡선이 바뀐다. 전략 이름을 다시 누르면{" "}
        <Link href={`/strategy/${selected.strategyId}`}>상세</Link>로 간다.
      </p>
    </>
  );
}
