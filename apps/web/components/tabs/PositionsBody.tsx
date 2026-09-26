"use client";

/**
 * 포지션 본문 (UI-FIX C-3).
 *
 * 행 = 심볼 · 방향·배수 · 손익 · 건강도 게이지. 진입 시각·증거금은 상세로 내렸다.
 *
 * - 손익은 **현재가 기준**(`exit_monitor.mark_net_return_pct`)이다 — 전에는 진입 비용만 담긴
 *   `net_return_pct` 를 읽어 네 포지션이 전부 −0.27% 였다(B-2, `lib/lab/fce-payload.ts`).
 * - 건강도는 **값이 없으면 칸째 없다**(B-3). FCE 페이퍼 거래에는 건강도가 없다.
 * - 청산 수준은 숨기지 않는다. FCE 에 청산 모델이 없어 −100% 아래로 갈 수 있다.
 */
import { PageFrame } from "../shell/PageFrame";
import { useSyncHint } from "../shell/SyncProvider";
import { AssetRow, Card, Empty, Hero, Pill, money, pct, tone } from "../ui";
import { sideLabel } from "../../lib/lab/labels";
import type { Wire } from "../../lib/lab/wire";

type Positions = Wire<"positions">;

/** 0~100 → 채워진 원. 숫자는 옆에 그대로 적는다 — 모양만으로는 72 와 80 을 못 가른다. */
function gaugeGlyph(score: number): string {
  if (score < 38) return "◔";
  if (score < 63) return "◑";
  if (score < 88) return "◕";
  return "●";
}

export function PositionsBody({ data }: { data: Positions }) {
  const hint = useSyncHint();

  return (
    <PageFrame
      title="포지션"
      description="FCE 가 들고 있는 것 · 전부 페이퍼"
      info={
        <>
          <p>{data.caveat}</p>
          <p>손익은 FCE 가 마지막으로 본 현재가 기준이다. 현재가를 모르는 포지션은 손익이 비고 합계에서 빠진다.</p>
        </>
      }
    >
      <Hero
        label="미실현 손익"
        value={
          <span className={`ui-num is-${tone(data.unrealizedUsdt)}`}>{money(data.unrealizedUsdt, "USDT")}</span>
        }
        meta={data.measurable < data.total ? `${data.total}건 중 ${data.measurable}건 합산` : `보유 ${data.total}건`}
      />

      {data.liquidationLevel > 0 ? (
        <p className="sh-alert">
          <strong>청산 수준 {data.liquidationLevel}건</strong> · 손익 −90% 아래
        </p>
      ) : null}

      {data.positions.length === 0 ? (
        <Empty title="아직 포지션이 없어요" reason={hint ?? "FCE 가 진입하면 여기 뜹니다."} />
      ) : (
        <Card flush>
          <ul className="ui-rows">
            {data.positions.map((p) => (
              <AssetRow
                key={p.id}
                name={p.symbol}
                subtitle={`${sideLabel(p.direction)}${p.leverage ? ` ${p.leverage}배` : ""}`}
                value={<span className={`ui-num is-${tone(p.netReturnPct)}`}>{pct(p.netReturnPct)}</span>}
                subValue={
                  p.healthScore === null ? undefined : (
                    <span className="ui-gauge" aria-label={`건강도 ${p.healthScore}`}>
                      {gaugeGlyph(p.healthScore)} {p.healthScore}
                    </span>
                  )
                }
                status={p.liquidationLevel ? <Pill tone="dn">청산 수준</Pill> : null}
                href={`/positions/${encodeURIComponent(p.id)}`}
              />
            ))}
          </ul>
        </Card>
      )}
    </PageFrame>
  );
}
