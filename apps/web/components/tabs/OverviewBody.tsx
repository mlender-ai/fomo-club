"use client";

/**
 * Overview 본문 (UI-04 · UI-FIX C-1).
 *
 * ```
 * 큰 숫자   총 자산 (Hero)
 * 그림      자산 추이
 * 목록      트랙
 * ```
 *
 * 숫자는 전부 조립본(`lib/lab/overview.ts`)에서 온다. 이 화면이 하는 계산은 **기간을 자르고
 * 그 기간의 처음과 끝을 빼는 것** 하나뿐이다(UI-04 B-1).
 *
 * 설명 문단은 없다 — 전부 제목 옆 `ⓘ` 로 접었다(UI-FIX A-3). 지운 것이 아니다.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageFrame } from "../shell/PageFrame";
import {
  AreaChartCard,
  AssetRow,
  Card,
  CompareBar,
  Delta,
  Hero,
  Info,
  ResearchItem,
  StatGroup,
  kstWhen,
  money,
  native,
  num,
  pct,
  tone,
} from "../ui";
import type { ResearchStatus } from "../ui";
import { TRACK_BASE_USD } from "../../lib/lab/portfolio";
import type { Wire } from "../../lib/lab/wire";

type Overview = Wire<"overview">;

const HOUR = 3_600_000;

/** 기간 — 차트와 Hero 변동이 **같이** 바뀐다(UI-04 B-1). */
const RANGES = [
  { key: "1D", label: "1D", ms: 24 * HOUR, period: "지난 24시간" },
  { key: "1W", label: "1W", ms: 7 * 24 * HOUR, period: "지난 7일" },
  { key: "1M", label: "1M", ms: 30 * 24 * HOUR, period: "지난 30일" },
  { key: "ALL", label: "전체", ms: null, period: "시작 이후" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const BASE = `$${TRACK_BASE_USD.toLocaleString("en-US")}`;

/** `2026-07-12T…` → `7/12` */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export function OverviewBody({ data }: { data: Overview }) {
  const [range, setRange] = useState<RangeKey>("ALL");
  const r = RANGES.find((x) => x.key === range) ?? RANGES[3];
  const { hero, series, stats } = data;

  // ── 기간을 자르고 그 기간의 처음과 끝을 뺀다 (UI-04 B-1) ─────────────────────
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
      changePct: base ? ((change ?? 0) / base) * 100 : null,
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
      <Hero
        label={`페이퍼 포트폴리오 · ${hero.trackCount}트랙`}
        value={money(hero.total)}
        delta={<Delta amount={window.change} percent={window.changePct} period={r.period} />}
        meta={`${money(hero.base, "USD").replace(".00", "")}에서 ${hero.days}일째`}
      />

      <Card
        title="자산 추이"
        info={
          <>
            <p>
              실선은 내 포트폴리오, 점선은 같은 돈을 첫날 BTC 에 넣었을 때다. 가는 가로 점선은{" "}
              {r.ms === null ? "시작 금액" : "기간 시작"}이다.
            </p>
            <p>
              회색 띠는 FCE 가 제대로 지켜보지 못한 날이다(관측률 {series.coverageMinPct}% 미만 · 크립토 {lostDays}
              일). 선을 끊지 않은 이유: 곡선이 실현 기준이라 그날도 값은 확정돼 있다.
            </p>
          </>
        }
      >
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
          bands={bands}
          format={(v) => money(v)}
        />
      </Card>

      <StatGroup
        stats={[
          { label: "운용중 트랙", value: `${stats.running} / ${stats.total}` },
          { label: "누적 거래", value: stats.trades.toLocaleString("en-US") },
          { label: "전체 승률", value: stats.winRatePct === null ? "—" : `${stats.winRatePct.toFixed(1)}%` },
          {
            label: "최대 낙폭",
            value: stats.worstMdd ? pct(stats.worstMdd.pct) : "—",
            tone: stats.worstMdd ? "dn" : "mute",
            note: stats.worstMdd?.label,
          },
        ]}
      />

      <Card
        title="트랙"
        flush
        info={
          <>
            <p>
              트랙마다 시작 자본과 통화가 달라 {BASE}로 환산해 합산했다. 정지·보류·제외 트랙도 빼지 않았다 — 빼면
              수익률이 좋아 보인다. 원래 금액:
            </p>
            <dl>
              {data.tracks.map((t) => (
                <FragmentRow key={t.key} term={t.label} value={native(t.nativeCurrent, t.currency)} />
              ))}
            </dl>
          </>
        }
      >
        <ul className="ui-rows">
          {data.tracks.map((t) => (
            <AssetRow
              key={t.key}
              icon={t.glyph}
              name={t.label}
              subtitle={t.subtitle}
              spark={t.spark}
              sparkTone={tone(t.returnPct)}
              value={t.normalized === null ? "—" : money(t.normalized)}
              subValue={<span className={`ui-num is-${tone(t.returnPct)}`}>{pct(t.returnPct)}</span>}
              href={`/strategies/${t.key}`}
            />
          ))}
        </ul>
      </Card>

      <p className="sh-foot">
        페이퍼 · 트랙당 {BASE} 환산 · 강제청산 미반영
        <Info title="이 숫자의 한계">
          <p>
            모의 매매다. 수수료·슬리피지·펀딩비는 반영했고, <strong>호가 두께와 강제청산은 아직 반영하지 않는다</strong>{" "}
            (<Link href="/research/02">연구 02</Link>).
          </p>
          <p>
            자본은 FCE 기준 그대로 <strong>시작 자본 + 실현 손익</strong>이다 — 미실현은 들어가지 않는다. 곡선도 같은
            기준으로 거래가 닫힐 때마다 움직이고, 주식·폴리마켓은 실현 시점을 아직 받지 않아 마지막 점에서만 반영된다.
          </p>
          <p>누적 거래·승률은 복기와 같은 거래 목록(랩이 받아 쌓은 닫힌 거래 전부)에서 센다.</p>
        </Info>
      </p>
    </PageFrame>
  );
}

function FragmentRow({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}

// ── 지금 연구 중 ────────────────────────────────────────────────────────────

function ResearchCard({ research }: { research: Overview["research"] }) {
  return (
    <Card title="지금 연구 중" aside={<Link href="/research">전부</Link>} flush>
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

// ── 전략 경쟁 ───────────────────────────────────────────────────────────────

function CompetitionCard({ competition: c }: { competition: Overview["competition"] }) {
  // 트랙마다 **자기 시작일부터** 잰 BTC 보유 기준선이 바로 아래 회색 막대로 붙는다(UI-FIX B-4).
  const items = c.rows.flatMap((row) => [
    { label: row.label, value: row.value, display: num(row.value), beats: row.beats },
    ...(row.baseline
      ? [{ label: `BTC ${md(row.from)}~`, value: row.baseline.value, display: num(row.baseline.value), isBaseline: true }]
      : []),
  ]);
  return (
    <Card
      title="전략 경쟁"
      description="수익 ÷ 낙폭 · 회색 = BTC 보유"
      info={
        <>
          <p>
            수익률이 아니라 수익을 낙폭으로 나눠 본다 — 수익률로 줄 세우면 레버리지를 많이 쓴 쪽이 이긴다. 기준선은 그
            트랙이 시작한 날부터 같은 기간 BTC 를 들고 있었을 때의 값이다. 전략 탭과 같은 값을 읽는다.
          </p>
          <dl>
            {c.rows.map((row) => (
              <FragmentRow
                key={row.key}
                term={row.label}
                value={`${num(row.value)} · 기준선 ${row.baseline ? num(row.baseline.value) : "—"} (${md(row.from)}~)`}
              />
            ))}
          </dl>
          {c.outOfRace.length > 0 ? <p>{c.outOfRace.join(" · ")} — 낙폭을 잴 거래가 없어 비교에서 뺐다.</p> : null}
        </>
      }
    >
      <CompareBar items={items} underTone="dn" />
    </Card>
  );
}

// ── 최근 활동 ───────────────────────────────────────────────────────────────

function ActivityCard({ activity }: { activity: Overview["activity"] }) {
  const now = new Date();
  return (
    <Card title="최근 활동" aside={<Link href="/journal">복기</Link>} flush>
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
