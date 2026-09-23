"use client";

/**
 * `/positions` — 포지션 (UI-00 §2 · UI-03 PART B).
 *
 * 가장 큰 숫자는 **미실현 손익 합계**다(UI-00 §4-2). 증거금과 손익률을 둘 다 아는
 * 포지션만 더한다 — 모르는 것을 0 으로 넣지 않는다.
 *
 * **청산 수준을 숨기지 않는다.** FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다.
 *
 * 30초 갱신·건강도 상세·패턴 시간봉은 `UI-06` 이다.
 */
import { LabView } from "../../../components/shell/LabView";
import { PageFrame } from "../../../components/shell/PageFrame";
import { useLab } from "../../../components/shell/useLab";
import { useSyncHint } from "../../../components/shell/SyncProvider";
import { AssetRow, Card, Empty, Hero, Pill, Skeleton, SkeletonRows, money, pct, tone } from "../../../components/ui";
import { shortStamp, sideLabel } from "../../../lib/lab/labels";
import type { Wire } from "../../../lib/lab/wire";

type Positions = Wire<"positions">;

export default function PositionsPage() {
  const { state, retry } = useLab<Positions>("/api/lab/positions");
  return (
    <LabView
      state={state}
      retry={retry}
      loading={
        <PageFrame title="포지션">
          <Skeleton width={320} height={60} />
          <SkeletonRows rows={5} />
        </PageFrame>
      }
    >
      {(data) => <PositionsBody data={data} />}
    </LabView>
  );
}

function PositionsBody({ data }: { data: Positions }) {
  const hint = useSyncHint();

  return (
    <PageFrame title="포지션" description="FCE 가 들고 있는 것 · 손익은 증거금 대비 · 전부 페이퍼">
      <Hero
        label={`미실현 손익 · 보유 ${data.total}건`}
        value={
          <span className={`ui-num is-${tone(data.unrealizedUsdt)}`}>{money(data.unrealizedUsdt, "USDT")}</span>
        }
        meta={
          data.measurable < data.total
            ? `${data.total}건 중 ${data.measurable}건만 더했다 — 나머지는 증거금이나 손익률을 모른다`
            : "증거금 × 손익률의 합"
        }
      />

      {data.liquidationLevel > 0 ? (
        <p className="sh-alert">
          <strong>청산 수준 {data.liquidationLevel}건.</strong> 손익이 −90% 아래다. 실제 거래소였으면 이미 청산됐을 자리다.
        </p>
      ) : null}

      {data.positions.length === 0 ? (
        <Empty
          title="아직 포지션이 없어요"
          reason={hint ?? "FCE 가 진입하면 여기 뜹니다."}
        />
      ) : (
        <Card title="보유" flush>
          <ul className="ui-rows">
            {data.positions.map((p) => (
              <AssetRow
                key={p.id}
                name={p.symbol}
                subtitle={`${sideLabel(p.direction)}${p.leverage ? ` · ${p.leverage}x` : ""} · 진입 ${shortStamp(p.entryAt)}`}
                value={<span className={`ui-num is-${tone(p.netReturnPct)}`}>{pct(p.netReturnPct)}</span>}
                subValue={p.marginUsdt === null ? "증거금 —" : `증거금 ${money(p.marginUsdt, "USDT")}`}
                change={
                  p.healthScore === null ? (
                    <Pill tone="mute">건강도 —</Pill>
                  ) : (
                    <Pill tone={p.healthScore < 40 ? "warn" : "mute"}>{`건강도 ${p.healthScore}`}</Pill>
                  )
                }
                status={p.liquidationLevel ? <Pill tone="dn">⚠ 청산 수준</Pill> : null}
                href={`/positions/${encodeURIComponent(p.id)}`}
              />
            ))}
          </ul>
        </Card>
      )}

      <p className="sh-note">{data.caveat}</p>
    </PageFrame>
  );
}
