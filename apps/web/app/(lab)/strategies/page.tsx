"use client";

/**
 * `/strategies` — 전략 (UI-00 §2 · UI-03 PART B).
 *
 * **FCE 트랙이 곧 전략이다.** 랩 자체 전략 3종은 폐기됐다(LAB-BRIDGE 0-3).
 *
 * 가장 큰 숫자는 "1위 전략의 수익/낙폭" — **기준선을 넘은 것이 없으면 그렇게 말한다**
 * (UI-00 §4-2). 순위 규칙은 LAB-FIX2 그대로다:
 *
 * | 규칙 | |
 * |---|---|
 * | 기준선 미달에 순위 없음 | |
 * | 표본 30 미만은 표본 부족 | `LAB-00 §7` |
 * | 정지·보류 사유를 옆에 | |
 *
 * 다듬는 것은 `UI-05` 다.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { AssetRow, Card, Hero, Pill, SkeletonRows, Skeleton, num, pct, tone } from "../../../components/ui";
import { trackStatus } from "../../../lib/lab/labels";
import type { Wire } from "../../../lib/lab/wire";

type Strategies = Wire<"strategies">;
type Row = Strategies["rows"][number];

/** 순위가 없는 이유. **비워두지 않는다** — 번호가 없으면 왜 없는지를 쓴다. */
function whyUnranked(r: Row, minSample: number): string | null {
  if (r.status !== "running") return r.statusReason ?? trackStatus(r.status).label;
  if (!r.ranked) return `표본 부족 (${r.trades ?? 0}/${minSample}건)`;
  if (r.beatsBenchmark === null) return "기준선 없음 — 비교 불가";
  if (!r.beatsBenchmark) return "기준 미달";
  return null;
}

export default function StrategiesPage() {
  const { state, retry } = useLab<Strategies>("/api/lab/strategies");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="전략">
          <Skeleton width={360} height={60} />
          <SkeletonRows rows={5} />
        </PageFrame>
      }
    >
      {(data) => <StrategiesBody data={data} />}
    </LabView>
  );
}

function StrategiesBody({ data }: { data: Strategies }) {
  // 번호를 줄 수 있는 것: 운용중 · 표본 충족 · 기준선을 넘음.
  const rankable = data.rows
    .filter((r) => whyUnranked(r, data.minSample) === null && r.returnOverMdd !== null)
    .sort((a, b) => (b.returnOverMdd ?? 0) - (a.returnOverMdd ?? 0));
  const leader = rankable[0] ?? null;
  const rankOf = new Map(rankable.map((r, i) => [r.key, i + 1]));

  return (
    <PageFrame title="전략" description="FCE 트랙이 곧 전략이다 · 순위는 수익/낙폭으로 · 전부 페이퍼">
      <Hero
        label={leader ? `1위 · ${leader.label} · 수익/낙폭` : "기준선 대비"}
        value={leader ? num(leader.returnOverMdd) : "기준선 넘은 전략 없음"}
        meta={
          leader
            ? `수익 ${pct(leader.returnPct)} · 낙폭 ${pct(leader.mddPct === null ? null : -Math.abs(leader.mddPct))}`
            : `표본 ${data.minSample}건 이상 ${data.rankableCount}개 · 기준선을 넘은 것 ${data.beatCount}개 — 순위를 매기지 않는다`
        }
      />

      <Card title="트랙" description="번호가 없는 줄은 왜 없는지 옆에 적었다" flush>
        <ul className="ui-rows">
          {data.rows.map((r) => {
            const why = whyUnranked(r, data.minSample);
            const rank = rankOf.get(r.key);
            const st = trackStatus(r.status);
            const mdd = r.mddPct === null ? null : -Math.abs(r.mddPct);
            return (
              <AssetRow
                key={r.key}
                icon={rank ? String(rank) : undefined}
                name={`${r.label}${r.leverage ? ` · ${r.leverage}x` : ""}`}
                subtitle={[
                  r.trades === null ? null : `N ${r.trades}`,
                  r.winRatePct === null ? null : `승률 ${r.winRatePct.toFixed(1)}%`,
                  r.profitFactor === null ? null : `PF ${num(r.profitFactor)}`,
                  mdd === null ? null : `MDD ${pct(mdd)}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "지표 없음"}
                value={<span className={`is-${tone(r.returnPct)}`}>{pct(r.returnPct)}</span>}
                subValue={
                  r.benchmarkReturnPct === null
                    ? "기준선 없음"
                    : `${r.benchmarkLabel ?? "기준"} ${pct(r.benchmarkReturnPct)}`
                }
                change={
                  why ? (
                    <Pill tone={why.startsWith("표본") ? "warn" : "mute"}>{why}</Pill>
                  ) : (
                    <Pill tone="blue">{`${rank}위`}</Pill>
                  )
                }
                status={
                  <Pill tone={st.tone} dot={st.dot ?? false}>
                    {st.label}
                  </Pill>
                }
                href={`/strategies/${r.key}`}
              />
            );
          })}
        </ul>
      </Card>

      <p className="sh-note">
        <strong>수익률 순위가 아니다.</strong> 수익률로 줄 세우면 레버리지를 많이 쓴 쪽이 이긴다. 수익을 낙폭으로 나눠 본다
        (<code>LAB-00 §7</code>). 기준선을 넘지 못했거나 표본이 30건 미만이면 번호를 주지 않는다.
      </p>
    </PageFrame>
  );
}
