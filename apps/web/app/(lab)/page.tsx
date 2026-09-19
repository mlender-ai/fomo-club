/**
 * `/` — 백테스트 화면.
 *
 * > **표 하나와 선 하나면 된다.**
 *
 * ## 이 화면의 일은 미화하지 않는 것이다 (LAB-FIX2)
 *
 * 처음 판은 C/M 내림차순으로 1·2위를 매기고 1위를 강조색으로 칠했다. 그런데 실측은
 * 두 전략 다 **BTC 그냥 보유보다 못했고**, 다중 비교 확률은 **99%** 였다.
 * 그 상태로 1위를 칠하면 화면이 "이게 제일 낫다" 고 말하는 셈인데, 사실은
 * **아무것도 안 하는 편이 낫다.**
 *
 * 그래서 규칙이 셋이다:
 *
 *  1. **벤치마크가 표 맨 위에 선다.** 기준이 먼저 보여야 미달이 미달로 읽힌다
 *  2. 벤치마크보다 C/M 이 낮으면 **번호 대신 `기준 미달`**
 *  3. 우연 확률이 `CHANCE_LIMIT` 이상이면 **아무에게도 번호를 주지 않는다**
 *
 * 강조색은 **벤치마크를 이긴 전략이 실제로 있을 때만** 쓴다.
 *
 * 서버 컴포넌트다. 행 선택·기간 선택은 **URL 쿼리**로 한다.
 */
import Link from "next/link";

import { EquityCurve } from "../../components/lab/EquityCurve";
import {
  PERIOD_LABEL,
  readBenchmarkCurve,
  readBoard,
  readCurve,
  type Board,
  type BoardRow,
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

/** 음수는 하락색. 0 은 중립이다. */
function sign(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "up" : "down";
}

function hold(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 48) return `${hours.toFixed(0)}시간`;
  return `${(hours / 24).toFixed(0)}일`;
}

function Row({
  row,
  selected,
  period,
  highlight,
}: {
  row: BoardRow;
  selected: boolean;
  period: PeriodKey;
  /** 강조색을 써도 되는 행인가. 벤치마크를 이긴 전략이 없으면 아무도 못 받는다. */
  highlight: boolean;
}) {
  const href = `/?period=${period}&run=${row.runId}`;
  const dim = row.halt !== "none";
  return (
    <tr
      className={[selected ? "is-selected" : "", dim ? "is-stopped" : ""].join(" ").trim()}
    >
      <td className="num rank">
        {row.rank ?? <span className="lab-nonrank">{row.note}</span>}
      </td>
      <td className="name">
        <Link href={href} className="lab-row-link" scroll={false}>
          {row.label}
        </Link>
      </td>
      <td className={`num ${sign(row.cagr)}`}>{pct(row.cagr)}</td>
      <td className={`num ${sign(row.mdd)}`}>{pct(row.mdd)}</td>
      <td className={`num ${highlight ? "accent" : ""}`}>{num(row.cagrMdd)}</td>
      <td className="num">{num(row.sharpe)}</td>
      <td className="num">{row.winRate === null ? "—" : `${row.winRate.toFixed(0)}%`}</td>
      <td className="num">{num(row.profitFactor)}</td>
      <td className="num">{hold(row.avgHoldHours)}</td>
      <td className="num">{row.maxConsecutiveLoss || "—"}</td>
      <td className="num">{row.trades}</td>
    </tr>
  );
}

/** 표 위 한 줄 — 무엇을 몇 개로 쟀고 **몇 개가 기준을 넘었나**(PART F-3). */
function Summary({ board }: { board: Board }) {
  const span = board.dataSpan;
  const dataLine =
    span.from && span.to
      ? `${span.from.toISOString().slice(0, 7)} ~ ${span.to.toISOString().slice(0, 7)} (${span.years.toFixed(1)}년 · ${span.bars.toLocaleString("ko-KR")}봉)`
      : "데이터 없음";
  // **채점한 구간은 데이터 기간보다 짧다.** 워크포워드가 앞 1년을 학습에 쓴다.
  const test = board.testSpan;
  const testLine =
    test.from && test.to
      ? `검증 ${test.from.toISOString().slice(0, 7)} ~ ${test.to.toISOString().slice(0, 7)} (학습 구간 제외)`
      : "검증 구간 없음";
  return (
    <p className="lab-summary">
      <span>데이터 {dataLine}</span>
      <span>{testLine}</span>
      <span>후보 {board.candidateCount}개</span>
      <strong className={board.beatCount === 0 ? "down" : "up"}>
        벤치마크를 이긴 전략 {board.beatCount}개
      </strong>
    </p>
  );
}

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; run?: string }>;
}) {
  const params = await searchParams;
  const period: PeriodKey = PERIODS.includes(params.period as PeriodKey)
    ? (params.period as PeriodKey)
    : "all";

  const board = await readBoard(period);

  if (board.rows.length === 0) {
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

  // 기본 선택은 거래가 있는 첫 행. 없으면 첫 행.
  const withTrades = board.rows.filter((r) => r.trades > 0);
  const selectedId =
    params.run && board.rows.some((r) => r.runId === params.run)
      ? params.run
      : (withTrades[0]?.runId ?? board.rows[0]?.runId ?? "");
  const selected = board.rows.find((r) => r.runId === selectedId) ?? (board.rows[0] as BoardRow);

  const curve = await readCurve(selected.runId, board.from);
  // 벤치마크는 **전략 곡선과 같은 구간**으로 자른다. 구간이 다르면 비교가 아니다.
  const benchmarkCurve = await readBenchmarkCurve(curve.from ?? board.from, curve.to);

  return (
    <>
      <div className="lab-head">
        <h1 className="lab-title">백테스트</h1>
        <nav className="lab-periods">
          {PERIODS.map((key) => (
            <Link
              key={key}
              href={`/?period=${key}`}
              className={`lab-period ${key === period ? "is-on" : ""}`}
              scroll={false}
            >
              {PERIOD_LABEL[key]}
            </Link>
          ))}
        </nav>
      </div>

      <Summary board={board} />

      {/* PART A-2 — 우연 확률이 높으면 **표 위에서 먼저** 말한다. 순위를 매겨 놓고
          밑에 덧붙이면 사람은 순위를 먼저 읽는다. */}
      {!board.rankable ? (
        <p className="lab-warning is-loud">
          이 검증으로는 어느 전략이 나은지 판단할 수 없다 — 후보{" "}
          {board.comparison.tested}개 중 하나가 우연히 좋아 보일 확률이{" "}
          {board.comparison.familyP === null
            ? "—"
            : `약 ${Math.round(board.comparison.familyP * 100)}%`}
          다. 순위를 매기지 않는다.
        </p>
      ) : null}

      <div className="lab-board-scroll">
        <table className="lab-board">
          <thead>
            <tr>
              <th className="rank">순위</th>
              <th>전략</th>
              <th>CAGR</th>
              <th>MDD</th>
              <th>C/M</th>
              <th>샤프</th>
              <th>승률</th>
              <th>손익비</th>
              <th>평균보유</th>
              <th>연속손실</th>
              <th>거래</th>
            </tr>
          </thead>

          {/* PART A-1 — **벤치마크가 맨 위다.** 기준이 먼저 보여야 미달이 미달로 읽힌다. */}
          <tbody className="lab-benchmark is-top">
            <tr>
              <td className="num rank">
                <span className="lab-nonrank">기준</span>
              </td>
              <td className="name">{board.benchmark.label}</td>
              <td className={`num ${sign(board.benchmark.cagr)}`}>{pct(board.benchmark.cagr)}</td>
              <td className={`num ${sign(board.benchmark.mdd)}`}>{pct(board.benchmark.mdd)}</td>
              <td className="num">{num(board.benchmark.cagrMdd)}</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
            </tr>
          </tbody>

          <tbody>
            {board.rows.map((row) => (
              <Row
                key={row.runId}
                row={row}
                selected={row.runId === selectedId}
                period={period}
                // **벤치마크를 이긴 전략이 없으면 강조색을 아무도 못 받는다**(PART A-3).
                highlight={board.beatCount > 0 && board.rankable && row.rank === 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 거래가 0인 행은 이유를 한 줄씩 적는다 — `종료`·`데이터 없음`·`신호 없음`은
          다른 사실이고, 뭉치면 왜 안 돌았는지 물을 수 없다(PART B-3). */}
      {board.rows
        .filter((row) => row.haltDetail)
        .map((row) => (
          <p key={row.runId} className="lab-halt">
            <span className="lab-nonrank">{row.note}</span> {row.label} — {row.haltDetail}
          </p>
        ))}

      <section className="lab-curve-block">
        <EquityCurve
          strategy={curve}
          strategyLabel={selected.label}
          benchmark={benchmarkCurve}
          benchmarkLabel={board.benchmark.label}
        />
      </section>

      <p className="lab-warning">{describeMultipleComparison(board.comparison)}</p>
      <p className="lab-empty-note">
        행을 누르면 자산곡선이 바뀐다. 전략 이름을 다시 누르면{" "}
        <Link href={`/strategy/${selected.strategyId}`}>상세</Link>로 간다.
      </p>
    </>
  );
}
