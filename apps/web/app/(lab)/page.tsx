"use client";

/**
 * `/` — Overview (UI-04).
 *
 * > 얼마로 시작해서 지금 얼마인가. 무엇이 잘되고 무엇이 안 되나. 지금 무엇을 확인하고 있나.
 *
 * ```
 * ① Hero            ⑥ 지금 연구 중
 * ② 차트            ⑦ 전략 경쟁
 * ③ 통계 4칸        ⑧ 최근 활동
 * ④ 트랙 리스트
 * ⑤ 주석
 * ```
 *
 * 숫자는 전부 조립본(`lib/lab/overview.ts`)에서 온다. 이 화면이 하는 계산은 **기간을 자르고
 * 그 기간의 처음과 끝을 빼는 것** 하나뿐이다(B-1).
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { LabView } from "../../components/shell/LabView";
import { PageFrame } from "../../components/shell/PageFrame";
import { useLab } from "../../components/shell/useLab";
import {
  AreaChartCard,
  AssetRow,
  Card,
  CompareBar,
  Delta,
  Hero,
  Pill,
  ResearchItem,
  Skeleton,
  SkeletonRows,
  StatGroup,
  kstWhen,
  money,
  native,
  num,
  pct,
  tone,
} from "../../components/ui";
import type { ResearchStatus } from "../../components/ui";
import { trackStatus } from "../../lib/lab/labels";
import { TRACK_BASE_USD } from "../../lib/lab/portfolio";
import type { Wire } from "../../lib/lab/wire";

type Overview = Wire<"overview">;

const HOUR = 3_600_000;

/** 기간 — 차트와 Hero 변동이 **같이** 바뀐다(B-1). */
const RANGES = [
  { key: "1D", label: "1D", ms: 24 * HOUR, period: "지난 24시간" },
  { key: "1W", label: "1W", ms: 7 * 24 * HOUR, period: "지난 7일" },
  { key: "1M", label: "1M", ms: 30 * 24 * HOUR, period: "지난 30일" },
  { key: "ALL", label: "전체", ms: null, period: "시작 이후" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function OverviewLoading() {
  // 실제 레이아웃과 같은 모양이어야 뜨는 순간 화면이 튀지 않는다(UI-03 E).
  return (
    <PageFrame
      title="Overview"
      hideTitle
      side={
        <>
          <Skeleton height={320} radius="var(--r-card)" />
          <Skeleton height={200} radius="var(--r-card)" />
        </>
      }
    >
      <Skeleton width={320} height={14} />
      <Skeleton width={380} height={60} />
      <Skeleton width={260} height={20} />
      <Skeleton height={300} radius="var(--r-card)" />
      <Skeleton height={104} radius="var(--r-stat)" />
      <SkeletonRows rows={5} />
    </PageFrame>
  );
}

export default function OverviewPage() {
  const { state, retry } = useLab<Overview>("/api/lab/overview");
  return (
    <LabView state={state} retry={retry} loading={<OverviewLoading />}>
      {(data) => <OverviewBody data={data} />}
    </LabView>
  );
}

function OverviewBody({ data }: { data: Overview }) {
  const [range, setRange] = useState<RangeKey>("ALL");
  const r = RANGES.find((x) => x.key === range) ?? RANGES[3];
  const { hero, series, stats } = data;

  // ── 기간을 자르고 그 기간의 처음과 끝을 뺀다 (B-1) ──────────────────────────
  const window = useMemo(() => {
    const all = series.points;
    const last = all[all.length - 1];
    if (!last) return { points: all, from: null as number | null, change: null, changePct: null };
    const endMs = Date.parse(last.at);
    const cut = r.ms === null ? null : endMs - r.ms;
    const points = cut === null ? all : all.filter((p) => Date.parse(p.at) >= cut);
    const first = points[0];
    const base = r.ms === null ? hero.base : (first?.value ?? null);
    const change = base === null ? null : last.value - base;
    return {
      points,
      from: cut,
      change,
      changePct: base ? (change ?? 0) / base * 100 : null,
    };
  }, [series.points, r.ms, hero.base]);

  const bands = series.bands.filter((b) => window.from === null || Date.parse(b.to) > window.from);
  const lostDays = series.bands.reduce((s, b) => s + b.days, 0);

  return (
    <PageFrame
      title="Overview"
      hideTitle
      side={
        <>
          <ResearchCard research={data.research} />
          <CompetitionCard competition={data.competition} />
          <ActivityCard activity={data.activity} />
        </>
      }
    >
      {/* ① Hero */}
      <Hero
        label={`페이퍼 포트폴리오 · ${hero.trackCount}트랙 · 트랙당 $${TRACK_BASE_USD.toLocaleString("en-US")} 환산`}
        value={money(hero.total)}
        delta={<Delta amount={window.change} percent={window.changePct} period={r.period} />}
        meta={`${money(hero.base, "USD").replace(".00", "")}로 시작 · ${hero.days}일째 · 실주문 없음`}
      />

      {/* ② 차트 */}
      <Card flush>
        <div className="ov-chart">
          <AreaChartCard
            compact
            step
            height={240}
            data={window.points}
            ranges={RANGES.map((x) => ({ key: x.key, label: x.label }))}
            activeRange={range}
            onRange={(k) => setRange(k as RangeKey)}
            baseline={r.ms === null ? hero.base : (window.points[0]?.value ?? null)}
            seriesLabel="내 포트폴리오"
            benchmarkLabel={series.benchmarkLabel}
            baselineLabel={r.ms === null ? "점선 = 시작 금액" : "점선 = 기간 시작"}
            bands={bands}
            bandLabel={`회색 = FCE 관측 부족일 (커버리지 < ${series.coverageMinPct}%) · 크립토 ${lostDays}일`}
            format={(v) => money(v)}
          />
        </div>
      </Card>

      {/* ③ 통계 4칸 */}
      <StatGroup
        stats={[
          {
            label: "운용중 트랙",
            value: `${stats.running} / ${stats.total}`,
            note:
              stats.notRunning.length > 0
                ? `${stats.notRunning.length}개 정지·보류 — ${stats.notRunning.join(" · ")}`
                : "전부 운용중",
          },
          {
            label: "누적 거래",
            value: stats.trades.toLocaleString("en-US"),
            note: stats.tradesBy.map((t) => `${t.label} ${t.n}`).join(" · ") || undefined,
          },
          {
            label: "전체 승률",
            value: stats.winRatePct === null ? "—" : `${stats.winRatePct.toFixed(1)}%`,
            note:
              stats.pfBy.length > 0
                ? `거래 가중 · 손익비 ${stats.pfBy.map((p) => `${p.label} ${num(p.pf)}`).join(" · ")}`
                : "거래 가중",
          },
          {
            label: "최대 낙폭",
            value: stats.worstMdd ? pct(stats.worstMdd.pct) : "—",
            tone: stats.worstMdd ? "dn" : "mute",
            note: stats.worstMdd ? `${stats.worstMdd.label} 트랙 · 실현 곡선 기준` : "잴 거래가 없다",
          },
        ]}
      />

      {/* ④ 트랙 리스트 */}
      <Card title="트랙" description="운용중 먼저 · 큰 숫자는 환산값, 작은 숫자가 원래 금액이다" flush>
        <ul className="ui-rows">
          {data.tracks.map((t) => {
            const st = trackStatus(t.status);
            return (
              <AssetRow
                key={t.key}
                icon={t.glyph}
                name={t.label}
                subtitle={t.subtitle}
                spark={t.spark}
                sparkTone={tone(t.returnPct)}
                value={t.normalized === null ? "—" : money(t.normalized)}
                subValue={native(t.nativeCurrent, t.currency)}
                change={<span className={`ui-num is-${tone(t.returnPct)}`}>{pct(t.returnPct)}</span>}
                status={
                  <Pill tone={st.tone} dot={st.dot ?? false}>
                    {st.label}
                  </Pill>
                }
                href={`/strategies/${t.key}`}
              />
            );
          })}
        </ul>
      </Card>

      {/* ⑤ 주석 */}
      <div className="ov-notes">
        <p className="sh-note">
          트랙마다 시작 자본과 통화가 달라 ${TRACK_BASE_USD.toLocaleString("en-US")}로 환산해 합산했다. 원래 금액은 각 행
          아래에 있다. 정지·보류·제외 트랙도 빼지 않고 넣었다 — 빼면 수익률이 좋아 보인다.
        </p>
        <p className="sh-note">
          모의 매매다. 수수료·슬리피지·펀딩비는 반영했고, <strong>호가 두께와 강제청산은 아직 반영하지 않는다</strong> (
          <Link href="/research/02">연구 02</Link>).
        </p>
        <p className="sh-note">
          자본은 FCE 기준 그대로 <strong>시작 자본 + 실현 손익</strong>이다 — 미실현은 들어가지 않는다. 곡선도 같은
          기준으로 거래가 닫힐 때마다 움직이고, 주식·폴리마켓은 실현 시점을 아직 받지 않아 마지막 점에서만 반영된다.
        </p>
      </div>
    </PageFrame>
  );
}

// ── ⑥ 지금 연구 중 ──────────────────────────────────────────────────────────

function ResearchCard({ research }: { research: Overview["research"] }) {
  return (
    <Card
      title="지금 연구 중"
      description={`열린 질문 ${research.open} · 닫힌 질문 ${research.closed}`}
      aside={<Link href="/research">전부</Link>}
      flush
    >
      <ul className="ui-research">
        {research.items.map((it) => (
          <ResearchItem
            key={it.no}
            no={it.no}
            title={it.title}
            status={it.status as ResearchStatus}
            summary={it.summary}
            verdict={it.verdict}
            blocks={it.blocks}
            href={`/research/${it.no}`}
          />
        ))}
      </ul>
    </Card>
  );
}

// ── ⑦ 전략 경쟁 ─────────────────────────────────────────────────────────────

function CompetitionCard({ competition: c }: { competition: Overview["competition"] }) {
  const items = [
    ...(c.baseline
      ? [{ label: c.baseline.label, value: c.baseline.value, display: num(c.baseline.value), isBaseline: true }]
      : []),
    ...c.rows.map((row) => ({ label: row.label, value: row.value, display: num(row.value) })),
  ];
  const since = c.from.slice(5, 10).replace("-", "/");
  return (
    <Card
      title="전략 경쟁"
      description={
        c.baseline
          ? `수익 ÷ 낙폭 · ${since} 이후 BTC 보유 기준선 ${num(c.baseline.value)}`
          : "수익 ÷ 낙폭"
      }
    >
      <CompareBar items={items} baseline={c.baseline?.value ?? null} underTone="dn" />
      <p className="ov-conclusion">
        {c.baseline === null
          ? "기준선을 만들 수 없다 — 이 기간 BTC 에 낙폭이 없다"
          : c.beaten === 0
            ? "기준선을 넘은 전략 없음"
            : `${c.beaten}개가 기준선을 넘었다`}
      </p>
      {c.outOfRace.length > 0 ? (
        <p className="sh-note">
          {c.outOfRace.join(" · ")} — 낙폭을 잴 거래가 없어 비교에서 뺐다. 숨긴 게 아니다: 트랙 리스트에 있다.
        </p>
      ) : null}
    </Card>
  );
}

// ── ⑧ 최근 활동 ─────────────────────────────────────────────────────────────

function ActivityCard({ activity }: { activity: Overview["activity"] }) {
  const now = new Date();
  return (
    <Card title="최근 활동" description="FCE 가 실제로 한 진입·청산" aside={<Link href="/journal">복기</Link>} flush>
      {activity.length === 0 ? (
        <p className="sh-note" style={{ padding: "0 var(--card-pad) var(--card-pad)" }}>
          아직 활동이 없어요.
        </p>
      ) : (
        <ul className="ov-activity">
          {activity.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <Link href="/journal" className="ov-activity-row">
                <span className="ov-activity-text">
                  {e.text}
                  {e.pct !== null ? <span className={`ui-num is-${tone(e.pct)}`}> {pct(e.pct, 1)}</span> : null}
                </span>
                <span className="ov-activity-when">{kstWhen(e.at, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
