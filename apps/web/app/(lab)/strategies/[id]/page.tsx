"use client";

/**
 * `/strategies/[id]` — 전략 상세 (UI-03 PART B).
 *
 * 트랙 키(`crypto` · `whale` · `stock_us` · `stock_kr` · `polymarket`)로 연다.
 * 전략 목록 조립본에서 골라낸다 — **API 를 한 번만 부른다.** 다듬는 것은 `UI-05` 다.
 */
import Link from "next/link";
import { useParams } from "next/navigation";

import { LabView } from "../../../../components/shell/LabView";
import { PageFrame } from "../../../../components/shell/PageFrame";
import { useLab } from "../../../../components/shell/useLab";
import {
  AreaChartCard,
  Card,
  Empty,
  Hero,
  Info,
  Pill,
  Skeleton,
  StatGroup,
  money,
  num,
  pct,
  tone,
} from "../../../../components/ui";
import { trackStatus } from "../../../../lib/lab/labels";
import type { Wire } from "../../../../lib/lab/wire";

type Strategies = Wire<"strategies">;

export default function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, retry } = useLab<Strategies>("/api/lab/strategies");

  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="전략">
          <Skeleton width={320} height={60} />
          <Skeleton height={120} radius="var(--r-stat)" />
          <Skeleton height={280} radius="var(--r-card)" />
        </PageFrame>
      }
    >
      {(data) => {
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
        const track = data.portfolio.tracks.find((t) => t.key === id) ?? null;
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
          >
            <Hero
              label="실현 수익률"
              value={<span className={`is-${tone(row.returnPct)}`}>{pct(row.returnPct)}</span>}
              meta={
                track?.nativeCurrent != null
                  ? `${money(track.nativeStart, track.currency)} → ${money(track.nativeCurrent, track.currency)}`
                  : "평가액 없음"
              }
            />

            {row.status !== "running" || row.leverage ? (
              <div className="sh-inline">
                {row.status !== "running" ? <Pill tone={st.tone}>{row.reason || st.label}</Pill> : null}
                {row.leverage ? <Pill tone="mute">{`${row.leverage}배`}</Pill> : null}
                {row.statusReason || row.evidenceNote ? (
                  <Info title={`${row.label} · ${st.label}`}>
                    {row.statusReason ? <p>{row.statusReason}</p> : null}
                    {row.evidenceNote ? <p>{row.evidenceNote}</p> : null}
                  </Info>
                ) : null}
              </div>
            ) : null}

            <StatGroup
              stats={[
                { label: "거래", value: row.trades === null ? "—" : String(row.trades) },
                { label: "승률", value: row.winRatePct === null ? "—" : `${row.winRatePct.toFixed(1)}%` },
                { label: "손익비", value: num(row.profitFactor) },
                { label: "최대 낙폭", value: pct(mdd), tone: mdd === null ? "mute" : "dn" },
                { label: "수익/낙폭", value: num(row.returnOverMdd) },
                // Overview 전략 경쟁과 **같은 값**(UI-FIX B-4).
                { label: "기준선", value: num(row.baseline?.value ?? null), note: row.baseline ? "BTC 보유" : undefined },
                {
                  label: "유효일",
                  value:
                    row.elapsedDays == null ? "—" : `${row.elapsedDays}/${row.calendarDays ?? "?"}`,
                  note: row.elapsedDays == null ? undefined : "유효 / 달력",
                },
              ]}
            />

            <Card
              title="자본"
              info={
                <>
                  <p>거래 이력의 실현 손익을 누적해 되만든 곡선이다 — 미실현이 빠진다.</p>
                  {row.sampleNote ? <p>{row.sampleNote}</p> : null}
                  {row.elapsedDays != null ? <p>유효일은 호스트가 잔 날을 뺀 날수다.</p> : null}
                </>
              }
            >
              {series && series.points.length > 1 ? (
                <AreaChartCard
                  data={series.points.map((pt) => ({
                    at: pt.at,
                    value: pt.capital,
                    benchmark: pt.benchmark,
                  }))}
                  baseline={track?.nativeStart ?? null}
                  benchmarkLabel={row.benchmarkLabel ?? "BTC 보유"}
                  format={(v) => money(v, track?.currency ?? "USD")}
                />
              ) : (
                <p className="sh-note">거래 이력이 아직 안 올라와 곡선이 없어요.</p>
              )}
            </Card>

          </PageFrame>
        );
      }}
    </LabView>
  );
}
