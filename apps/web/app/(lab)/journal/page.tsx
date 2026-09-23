"use client";

/**
 * `/journal` — 복기 (UI-00 §2 · UI-03 PART B).
 *
 * 가장 큰 숫자는 **누적 실현 손익**이다(UI-00 §4-2).
 *
 * **비용을 따로 보여준다.** 실측으로 손실의 절반 가까이가 수수료·펀딩비였다. `net` 만
 * 보이면 그게 안 보인다. 목표가·손절선은 여기 없다 — 랩이 FCE 에서 받아오지도 않는다
 * (LAB-08).
 *
 * 사후 채점·다듬기는 `UI-09` 다.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { useSyncHint } from "../../../components/shell/SyncProvider";
import {
  AssetRow,
  Card,
  Empty,
  Hero,
  Pill,
  Skeleton,
  SkeletonRows,
  StatGroup,
  money,
  pct,
  tone,
} from "../../../components/ui";
import { exitLabel, shortStamp, sideLabel } from "../../../lib/lab/labels";
import type { Wire } from "../../../lib/lab/wire";

type Journal = Wire<"journal">;

export default function JournalPage() {
  const { state, retry } = useLab<Journal>("/api/lab/journal");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="복기">
          <Skeleton width={320} height={60} />
          <Skeleton height={110} radius="var(--r-stat)" />
          <SkeletonRows rows={8} />
        </PageFrame>
      }
    >
      {(data) => <JournalBody data={data} />}
    </LabView>
  );
}

function JournalBody({ data }: { data: Journal }) {
  const hint = useSyncHint();
  const t = data.total;

  if (t.count === 0) {
    return (
      <PageFrame title="복기">
        <Empty title="닫힌 거래가 아직 없어요" reason={hint ?? "FCE 가 포지션을 닫으면 여기 쌓입니다."} />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="복기"
      description={`닫힌 거래 ${t.count}건 · ${shortStamp(data.span.from)} ~ ${shortStamp(data.span.to)} · 전부 페이퍼`}
    >
      <Hero
        label="누적 실현 손익 · 비용 후"
        value={<span className={`ui-num is-${tone(t.netUsdt)}`}>{money(t.netUsdt, "USDT")}</span>}
        meta={
          t.costSharePct === null
            ? undefined
            : `수수료·펀딩비가 총손익 규모의 ${t.costSharePct.toFixed(1)}% 다`
        }
      />

      <StatGroup
        stats={[
          { label: "이김 · 짐", value: `${t.wins} · ${t.losses}`, note: t.flat > 0 ? `0원 ${t.flat}건은 따로` : undefined },
          { label: "비용 전", value: money(t.grossUsdt, "USDT"), tone: tone(t.grossUsdt) },
          { label: "비용", value: money(-Math.abs(t.costsUsdt), "USDT"), tone: "dn" },
          { label: "비용 후", value: money(t.netUsdt, "USDT"), tone: tone(t.netUsdt) },
        ]}
      />

      {t.grossUsdt > 0 && t.netUsdt <= 0 ? (
        <p className="sh-alert">
          <strong>비용 전에는 벌었지만 비용 후에는 잃었다.</strong> 전략이 아니라 비용이 결과를 정했다.
        </p>
      ) : null}

      {data.countNote ? (
        <p className="sh-note">
          <strong>
            전광판 {data.boardCount}건 · 이 표 {t.count}건.
          </strong>{" "}
          {data.countNote}
        </p>
      ) : null}

      <Card
        title={`최근 ${data.trades.length}건`}
        description={t.count > data.trades.length ? `나머지 ${t.count - data.trades.length}건은 위 합계에만` : undefined}
        flush
      >
        <ul className="ui-rows">
          {data.trades.map((tr) => (
            <AssetRow
              key={tr.id}
              name={tr.symbol}
              subtitle={`${sideLabel(tr.direction)}${tr.leverage ? ` · ${tr.leverage}x` : ""} · ${shortStamp(tr.exitAt)} 청산`}
              value={<span className={`ui-num is-${tone(tr.netPnlUsdt)}`}>{money(tr.netPnlUsdt, "USDT")}</span>}
              subValue={tr.costsUsdt === null ? "비용 —" : `비용 ${money(tr.costsUsdt, "USDT")}`}
              change={<Pill tone={tone(tr.netReturnPct)}>{pct(tr.netReturnPct)}</Pill>}
              status={<Pill tone="mute">{exitLabel(tr.exitReason)}</Pill>}
            />
          ))}
        </ul>
      </Card>

      <p className="sh-note">손익률은 증거금 대비다. 목표가·손절선은 이 표에 없다 — 랩이 FCE 에서 받아오지도 않는다.</p>
    </PageFrame>
  );
}
