"use client";

/**
 * `/` — Overview (UI-00 §2 · UI-03 PART B).
 *
 * 가장 큰 숫자는 **총 자산**이다 — 트랙당 $10,000 환산(UI-02 C).
 *
 * **UI-03 의 몫은 "이 탭이 눌리고, 받은 것을 정직하게 보여준다" 까지다.** 목표 화면
 * (`UI-target-overview.html`) 수준으로 다듬는 것은 `UI-04` 다.
 *
 * 1차 백테스트 보관함은 여기 있었다. 전략 3종을 폐기하면서(LAB-BRIDGE 0-3) 판정은
 * 연구 04 로 옮겼다 — `/backtest` 가 그쪽으로 간다.
 */
import Link from "next/link";

import { LabView } from "../../components/shell/LabView";
import { PageFrame } from "../../components/shell/PageFrame";
import { useLab } from "../../components/shell/useLab";
import {
  AreaChartCard,
  AssetRow,
  Card,
  Delta,
  Hero,
  Pill,
  ResearchItem,
  Skeleton,
  SkeletonRows,
  StatGroup,
  money,
  pct,
  tone,
} from "../../components/ui";
import type { ResearchStatus } from "../../components/ui";
import { trackStatus } from "../../lib/lab/labels";
import { TRACK_BASE_USD } from "../../lib/lab/portfolio";
import type { Wire } from "../../lib/lab/wire";

type Overview = Wire<"overview">;

function OverviewLoading() {
  return (
    <PageFrame title="Overview" side={<Skeleton height={320} radius="var(--r-card)" />}>
      <Skeleton width={200} height={16} />
      <Skeleton width={360} height={60} />
      <Skeleton height={300} radius="var(--r-card)" />
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
  const p = data.portfolio;
  // 자본 곡선은 **되만든 값**이다. 지금은 크립토만 거래 이력이 올라온다.
  const curve = data.series[0] ?? null;
  const curveTrack = curve ? p.tracks.find((t) => t.key === curve.trackKey) : null;
  const start = curveTrack?.nativeStart ?? null;

  const chart =
    curve && start && start > 0
      ? curve.points.map((pt) => ({
          at: pt.at.slice(5, 10),
          // 트랙당 $10,000 으로 맞춰 그린다 — hero 와 같은 단위여야 읽힌다.
          value: (TRACK_BASE_USD * pt.capital) / start,
          benchmark: pt.benchmark === null ? null : (TRACK_BASE_USD * pt.benchmark) / start,
        }))
      : [];

  return (
    <PageFrame
      title="Overview"
      side={
        <>
          <Card
            title="열린 질문"
            description="무엇을 확인하고 있나"
            aside={<Link href="/research">전부 보기</Link>}
            flush
          >
            {data.research.items.length === 0 ? (
              <p className="sh-note" style={{ padding: "0 var(--card-pad) var(--card-pad)" }}>
                열린 질문이 없어요.
              </p>
            ) : (
              <ul className="ui-research">
                {data.research.items.map((r) => (
                  <ResearchItem
                    key={r.no}
                    no={r.no}
                    title={r.title}
                    status={r.status as ResearchStatus}
                    summary={r.summary}
                    href={`/research/${r.no}`}
                  />
                ))}
              </ul>
            )}
          </Card>
          <StatGroup
            stats={[
              { label: "보유 포지션", value: String(data.positions), note: <Link href="/positions">포지션</Link> },
              {
                label: "합산에서 빠진 트랙",
                value: String(p.excluded.length),
                note: "평가액을 몰라 0 으로 채우지 않았다",
              },
            ]}
          />
        </>
      }
    >
      <Hero
        label={`트랙당 $${TRACK_BASE_USD.toLocaleString("en-US")} 환산 · 전부 페이퍼`}
        value={money(p.total)}
        delta={<Delta amount={p.changeUsd} percent={p.changePct} period="시작 대비" />}
        meta={
          p.excluded.length > 0
            ? `${p.excluded.map((e) => e.label).join(" · ")} 은(는) 평가액이 없어 합산에서 뺐다 — 분모도 ${money(p.base)} 다.`
            : `시작 ${money(p.base)}`
        }
      />

      <Card
        title={curveTrack ? `${curveTrack.label} 자본` : "자본"}
        description={
          curve
            ? "거래 이력의 실현 손익을 누적해 되만든 곡선이다 — 미실현이 빠지고 계단이 된다"
            : undefined
        }
      >
        {chart.length > 1 ? (
          <AreaChartCard
            data={chart}
            baseline={TRACK_BASE_USD}
            benchmarkLabel="BTC 보유"
            format={(v) => money(v)}
          />
        ) : (
          <p className="sh-note">
            자본 이력이 아직 없어요. FCE 에는 자본 기록이 없어서 거래 이력으로 되만드는데, 거래가 올라온
            트랙이 없습니다.
          </p>
        )}
      </Card>

      <Card title="트랙" description="원래 금액은 오른쪽에 작게 — 큰 숫자는 환산값이다" flush>
        <ul className="ui-rows">
          {p.tracks.map((t) => {
            const st = trackStatus(t.status);
            return (
              <AssetRow
                key={t.key}
                name={t.label}
                subtitle={t.statusReason ?? t.currency}
                value={t.normalized === null ? "—" : money(t.normalized)}
                subValue={t.nativeCurrent === null ? "평가액 없음" : money(t.nativeCurrent, t.currency)}
                change={<Pill tone={tone(t.returnPct)}>{pct(t.returnPct)}</Pill>}
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

      <p className="sh-note">
        <strong>왜 환산하나.</strong> 그대로 더하면 주식 KR 1억 원이 크립토 500 USDT 를 덮어, 크립토가 −30% 나도 총합은
        거의 안 움직인다. 트랙마다 같은 무게($10,000)로 맞췄다. 정지한 트랙도 빼지 않는다 — 빼면 수익률이 좋아 보인다.
      </p>
    </PageFrame>
  );
}
