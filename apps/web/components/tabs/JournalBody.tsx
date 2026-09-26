"use client";

/**
 * 복기 본문 (UI-FIX C-4).
 *
 * ```
 * 실현 손익          ← hero
 * 117승 · 130패  [비용 88%]
 * 비용 전 · 비용     ← 2칸 (비용 후는 hero 와 같다)
 * 최근 60건
 * ```
 *
 * **비용을 숨기지 않는다** — 수수료·펀딩비가 총손익 규모의 대부분이라는 게 이 화면의 발견이다.
 * 문장 대신 알약 하나로 남긴다. 거래 수는 Overview 누적 거래와 같은 행들을 센다(B-5).
 */
import { PageFrame } from "../shell/PageFrame";
import { useSyncHint } from "../shell/SyncProvider";
import { AssetRow, Card, Empty, Hero, Pill, StatGroup, money, pct, tone } from "../ui";
import { exitLabel, shortStamp, sideLabel } from "../../lib/lab/labels";
import type { Wire } from "../../lib/lab/wire";

type Journal = Wire<"journal">;

export function JournalBody({ data }: { data: Journal }) {
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
      description={`닫힌 거래 ${t.count}건 · 전부 페이퍼`}
      info={
        <>
          <p>
            {shortStamp(data.span.from)} ~ {shortStamp(data.span.to)} 에 닫힌 거래 전부다. Overview 의 누적 거래와 같은
            목록을 센다.
          </p>
          <p>
            비용 {t.costSharePct === null ? "—" : `${t.costSharePct.toFixed(1)}%`} = 수수료·펀딩비 ÷ 비용 전 손익의 크기.
            손익률은 증거금 대비다. 목표가·손절선은 여기 없다 — 랩이 FCE 에서 받아오지도 않는다.
          </p>
          {t.flat > 0 ? <p>손익이 정확히 0 인 거래 {t.flat}건은 승·패 어디에도 넣지 않았다.</p> : null}
        </>
      }
    >
      <Hero
        label="실현 손익"
        value={<span className={`ui-num is-${tone(t.netUsdt)}`}>{money(t.netUsdt, "USDT")}</span>}
        delta={
          t.costSharePct === null ? undefined : (
            <p className="ui-delta">
              <Pill tone="warn">{`비용 ${Math.round(t.costSharePct)}%`}</Pill>
            </p>
          )
        }
        meta={`${t.wins}승 · ${t.losses}패`}
      />

      <StatGroup
        stats={[
          { label: "비용 전", value: money(t.grossUsdt, "USDT"), tone: tone(t.grossUsdt) },
          { label: "비용", value: money(-Math.abs(t.costsUsdt), "USDT"), tone: "dn" },
        ]}
      />

      {t.grossUsdt > 0 && t.netUsdt <= 0 ? (
        <p className="sh-alert">
          <strong>비용이 결과를 뒤집었다</strong> · 비용 전 이익
        </p>
      ) : null}

      <Card
        title={`최근 ${data.trades.length}건`}
        flush
        info={
          t.count > data.trades.length ? (
            <p>
              나머지 {t.count - data.trades.length}건은 표에 없고 위 합계에만 들어간다. 합계는 표에 보이는 것이 아니라
              전부를 센다.
            </p>
          ) : undefined
        }
      >
        <ul className="ui-rows">
          {data.trades.map((tr) => (
            <AssetRow
              key={tr.id}
              name={tr.symbol}
              subtitle={`${sideLabel(tr.direction)} · ${exitLabel(tr.exitReason)} · ${shortStamp(tr.exitAt).slice(0, 5)}`}
              value={<span className={`ui-num is-${tone(tr.netPnlUsdt)}`}>{money(tr.netPnlUsdt, "USDT")}</span>}
              subValue={pct(tr.netReturnPct)}
            />
          ))}
        </ul>
      </Card>
    </PageFrame>
  );
}
