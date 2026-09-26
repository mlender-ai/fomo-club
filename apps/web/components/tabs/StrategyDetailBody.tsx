"use client";

/**
 * 전략 상세 본문 (UI-05 PART B).
 *
 * ```
 * B-1  Hero — $10,000 환산 · 변동 · `500 USDT · 76일째` + 상태·배수·지갑 알약
 * B-2  자본 곡선 + BTC 보유
 * B-3  6칸 — 수익÷낙폭 · 승률 · PF · MDD · 거래 · 평균 보유
 * B-4  BTC 보유와 비교 표 + 해석 한 줄
 * B-5  거래별 손익률 분포 — 중앙값 · 최대 손실 · 최대 이익
 * B-6  관련 연구
 * B-7  최근 거래 10건 + 전체 보기
 * ```
 *
 * 전략 목록 조립본에서 골라낸다 — **API 를 한 번만 부른다.**
 */
import Link from "next/link";
import { useState } from "react";

import { PageFrame } from "../shell/PageFrame";
import {
  AreaChartCard,
  AssetRow,
  Card,
  DataTable,
  Delta,
  Empty,
  Hero,
  Histogram,
  Pill,
  ResearchItem,
  StatGroup,
  money,
  native,
  num,
  pct,
  tone,
  type ResearchStatus,
} from "../ui";
import { exitLabel, shortStamp, sideLabel, trackStatus } from "../../lib/lab/labels";
import { TRACK_BASE_USD } from "../../lib/lab/portfolio";
import type { Wire } from "../../lib/lab/wire";
import { holdLabel } from "./StrategiesBody";

type Strategies = Wire<"strategies">;
type Row = Strategies["rows"][number];

export function StrategyDetailBody({ data, id }: { data: Strategies; id: string }) {
  const row = data.rows.find((r) => r.key === id);
  if (!row) {
    return (
      <PageFrame title="전략">
        <Empty
          title="그런 전략이 없어요"
          reason={`'${id}' 라는 트랙을 FCE 가 올리지 않았습니다.`}
          action={<Link href="/strategies">전략 목록으로</Link>}
        />
      </PageFrame>
    );
  }
  const series = data.series.find((s) => s.trackKey === id) ?? null;
  const st = trackStatus(row.status);
  const mdd = row.mddPct === null ? null : -Math.abs(row.mddPct);

  return (
    <PageFrame
      title={row.label}
      description={
        <>
          <Link href="/strategies">전략</Link> · FCE 트랙 · 전부 페이퍼
        </>
      }
      info={
        <>
          <p>
            큰 숫자는 트랙 시작 자본을 ${TRACK_BASE_USD.toLocaleString("en-US")} 로 환산한 지금 값이다. 원래 통화로는{" "}
            {money(row.nativeStart, row.currency)} → {money(row.nativeCurrent, row.currency)}.
          </p>
          {row.statusReason ? <p>{row.statusReason}</p> : null}
          {row.evidenceNote ? <p>{row.evidenceNote}</p> : null}
          {row.sampleNote ? <p>{row.sampleNote}</p> : null}
          {row.elapsedDays != null ? (
            <p>
              유효일 {row.elapsedDays} / 달력 {row.calendarDays ?? "?"}일 — 호스트가 잔 날은 검증에 안 들어간다.
            </p>
          ) : null}
          <p>페이퍼다. 강제청산은 반영되지 않는다.</p>
        </>
      }
    >
      {/* B-1 */}
      <Hero
        label={`$${TRACK_BASE_USD.toLocaleString("en-US")} 환산`}
        value={money(row.normalized, "USD")}
        delta={
          row.normalized === null ? undefined : (
            <Delta amount={row.normalized - TRACK_BASE_USD} percent={row.returnPct} period="시작 이후" />
          )
        }
        // 시작 자본은 대개 딱 떨어진다 — `.00` 을 붙이면 16자를 넘는다(`100,000 USD로 시작`).
        meta={`${
          Number.isInteger(row.nativeStart) && row.currency !== "KRW"
            ? `${num(row.nativeStart, 0)} ${row.currency}`
            : native(row.nativeStart, row.currency)
        }로 시작`}
      />
      <div className="sh-inline">
        {row.days ? <Pill tone="mute">{`${row.days}일째`}</Pill> : null}
        {row.status !== "running" ? <Pill tone={st.tone}>{row.reason || st.label}</Pill> : null}
        {/* 레버리지를 숨기지 않는다(UI-05 하지 말 것). 모르면 모른다고 쓴다. */}
        <Pill tone="mute">{row.leverage ? `${row.leverage}배` : "배수 —"}</Pill>
        {row.wallets ? <Pill tone="mute">{`지갑 ${row.wallets}개`}</Pill> : null}
        {row.rank ? <Pill tone="up">{`${row.rank}위`}</Pill> : null}
        {row.verdict === "under" ? <Pill tone="dn">기준 미달</Pill> : null}
      </div>

      {/* B-2 */}
      <Card
        title="자본"
        description={`— ${row.label}  --- BTC 보유`}
        info={<p>거래 이력의 실현 손익을 누적해 되만든 곡선이다 — 미실현이 빠진다. 점선은 같은 돈으로 BTC 를 샀을 때다.</p>}
      >
        {series && series.points.length > 1 ? (
          <AreaChartCard
            data={series.points.map((pt) => ({ at: pt.at, value: pt.capital, benchmark: pt.benchmark }))}
            baseline={row.nativeStart}
            benchmarkLabel={row.benchmarkLabel ?? "BTC 보유"}
            seriesLabel={row.label}
            format={(v) => money(v, row.currency)}
            step
          />
        ) : (
          <p className="sh-note">거래 이력이 없어 곡선이 없어요.</p>
        )}
      </Card>

      {/* B-3 */}
      <StatGroup
        stats={[
          { label: "수익 ÷ 낙폭", value: num(row.returnOverMdd) },
          { label: "승률", value: row.winRatePct === null ? "—" : `${row.winRatePct.toFixed(1)}%` },
          { label: "PF", value: num(row.profitFactor) },
          { label: "최대 낙폭", value: pct(mdd), tone: mdd === null ? "mute" : "dn" },
          { label: "거래", value: row.trades === null ? "—" : String(row.trades) },
          { label: "평균 보유", value: holdLabel(row.avgHoldHours) },
        ]}
      />

      {/* B-4 */}
      <BenchmarkCard row={row} />

      {/* B-5 */}
      <DistributionCard row={row} />

      {/* B-6 */}
      {row.research.length > 0 ? (
        <Card title="관련 연구" aside={<Link href="/research">전부</Link>} flush>
          <ul className="ui-research">
            {row.research.map((r) => (
              <ResearchItem
                key={r.no}
                no={r.no}
                title={r.title}
                status={r.status as ResearchStatus}
                href={`/research/${r.no}`}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {/* B-7 */}
      <TradesCard row={row} />
    </PageFrame>
  );
}

// ── B-4 BTC 보유와 비교 ─────────────────────────────────────────────────────

function BenchmarkCard({ row }: { row: Row }) {
  const b = row.baseline;
  if (!b) return null;
  const mdd = row.mddPct === null ? null : -Math.abs(row.mddPct);
  const bmdd = b.mddPct === null ? null : -Math.abs(b.mddPct);
  const from = row.baselineFrom ? `${Number(row.baselineFrom.slice(5, 7))}/${Number(row.baselineFrom.slice(8, 10))}~` : "";
  return (
    <Card
      title="BTC 보유와 비교"
      description={`같은 기간 ${from}`}
      flush
      info={<p>이 트랙이 시작한 날 같은 돈으로 BTC 를 사서 들고만 있었다면. 수익 ÷ 낙폭이 기준선을 넘어야 이긴 것이다.</p>}
    >
      <DataTable
        caption="전략과 BTC 보유 비교"
        columns={[
          { key: "what", label: "" },
          { key: "mine", label: row.label, numeric: true },
          { key: "btc", label: "BTC 보유", numeric: true },
        ]}
        rows={[
          {
            key: "ret",
            what: "수익률",
            mine: <span className={`is-${tone(row.returnPct)}`}>{pct(row.returnPct)}</span>,
            btc: <span className={`is-${tone(b.returnPct)}`}>{pct(b.returnPct)}</span>,
          },
          {
            key: "mdd",
            what: "최대 낙폭",
            mine: <span className="is-dn">{pct(mdd)}</span>,
            btc: <span className="is-dn">{pct(bmdd)}</span>,
          },
          { key: "rm", what: "수익 ÷ 낙폭", mine: num(row.returnOverMdd), btc: num(b.value) },
        ]}
      />
      {row.interpretation ? <p className="st-line st-body">{row.interpretation}</p> : null}
    </Card>
  );
}

// ── B-5 분포 ────────────────────────────────────────────────────────────────

function DistributionCard({ row }: { row: Row }) {
  const d = row.distribution;
  if (!d) return null;
  return (
    <Card
      title="거래별 손익률"
      description={`${d.count}건 · 점선 = 중앙값`}
      info={<p>거래 하나하나의 증거금 대비 손익률이다. 막대 하나가 {d.width}%p 폭이고, 0 보다 아래는 빨강이다.</p>}
    >
      <Histogram bins={d.bins} median={d.median} />
      <StatGroup
        stats={[
          { label: "중앙값", value: pct(d.median), tone: tone(d.median) },
          { label: "최대 손실", value: pct(d.worst), tone: tone(d.worst) },
          { label: "최대 이익", value: pct(d.best), tone: tone(d.best) },
          { label: "평균 이익 · 손실", value: `${pct(d.avgWin, 1)} · ${pct(d.avgLoss, 1)}` },
        ]}
      />
      {d.reading ? <p className="st-line">{d.reading}</p> : null}
    </Card>
  );
}

// ── B-7 최근 거래 ───────────────────────────────────────────────────────────

function TradesCard({ row }: { row: Row }) {
  const [all, setAll] = useState(false);
  if (row.ledger.length === 0) return null;
  const list = all ? row.ledger : row.recent;
  return (
    <Card
      title={all ? `거래 ${row.ledger.length}건` : `최근 ${row.recent.length}건`}
      flush
      aside={<Link href="/journal">복기</Link>}
    >
      <ul className="ui-rows">
        {list.map((t, i) => (
          <AssetRow
            key={`${t.exitAt}-${t.symbol}-${i}`}
            name={t.symbol}
            subtitle={`${sideLabel(t.direction)} · ${exitLabel(t.exitReason)} · ${shortStamp(t.exitAt).slice(0, 5)}`}
            value={<span className={`ui-num is-${tone(t.netPnlUsdt)}`}>{money(t.netPnlUsdt, row.currency)}</span>}
            subValue={pct(t.netReturnPct)}
          />
        ))}
      </ul>
      {row.ledger.length > row.recent.length ? (
        <button type="button" className="st-more" onClick={() => setAll((v) => !v)}>
          {all ? "최근 것만 보기" : `전체 ${row.ledger.length}건 보기`}
        </button>
      ) : null}
    </Card>
  );
}

