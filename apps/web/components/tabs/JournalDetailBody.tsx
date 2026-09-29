"use client";

/**
 * 거래 상세 본문 (UI-09 PART B).
 *
 * ```
 * SOLUSDT · 롱 · 3배                           −8.0%
 * 크립토 · 09-21 14:00 ~ 09-23 08:47 · 2일
 * [캔들 — 진입 ▲ · 청산 ▼ · 무효화 · 익절]
 * 진입   시각 · 가격 · 사유(FCE 근거 · 고래 체결)
 * 청산   시각 · 가격 · 사유
 * 비용   비용 전 · 수수료·펀딩(FCE 한 칸) · 순손익
 * 당시 조건   FCE 스탠스 · 진입 체크리스트
 * 사후 채점   청산 7일 뒤 가격 · 방향 맞춘 % · **한 줄 해석**
 * ```
 */
import Link from "next/link";
import { useMemo } from "react";

import { PageFrame } from "../shell/PageFrame";
import {
  CandleChart,
  Card,
  Empty,
  Glossed,
  Hero,
  Pill,
  money,
  pct,
  price,
  tone,
  useBitgetCandles,
  type ChartMarker,
  type PriceLine,
} from "../ui";
import { claimText, engineLabel, exitLabel, sideLabel, stanceLabel } from "../../lib/lab/labels";
import type { JournalDetail } from "../../lib/lab/journal";
import { CATEGORY_LABEL } from "../../lib/lab/journal-extra";
import type { Jsonify } from "../../lib/lab/wire";
import { holdLabel } from "./JournalBody";

type Detail = Jsonify<JournalDetail>;

const HOUR = 3600;

/** FCE 체크리스트 상태. `na` 는 실패가 아니라 해당 없음이다 — 빨갛게 칠했다가 고쳤다. */
const CHECK: Record<string, string> = { pass: "통과", fail: "실패", na: "해당 없음", warn: "주의", skip: "건너뜀" };

function kst(iso: string | null): string {
  if (!iso) return "—";
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");
}

export function JournalDetailBody({ data }: { data: Detail }) {
  const t = data.trade;
  const d = data.detail;
  const p = data.postExit;
  const title = `${t.symbol} · ${sideLabel(t.direction)}${t.leverage ? ` · ${t.leverage}배` : ""}`;
  const stance = d?.stance ? stanceLabel(d.stance, t.direction) : null;

  return (
    <PageFrame
      title={t.symbol}
      description={
        <>
          <Link href="/journal">복기</Link> · {t.trackLabel} · 페이퍼
        </>
      }
      info={
        <>
          <p>진입 사유 · 당시 조건은 FCE 가 진입할 때 적은 것이다. 손익률은 증거금 대비이고 비용이 들어 있다.</p>
          <p>
            사후 채점은 랩이 잰다 — 청산가와 청산 7일 뒤 그날 일봉 종가(Bitget 공개 시세). FCE 는 페이퍼 거래의 청산 뒤
            가격을 재지 않는다.
          </p>
        </>
      }
    >
      <Hero
        label={title}
        value={<span className={`ui-num is-${tone(t.netReturnPct)}`}>{pct(t.netReturnPct)}</span>}
        meta={money(t.netPnlUsdt, "USDT")}
      />
      <p className="st-line">
        {kst(t.entryAt)} ~ {kst(t.exitAt)} · {holdLabel(t.holdHours)}
      </p>

      <ChartCard data={data} />

      <div className="jd-grid">
        <Card title="진입">
          <dl className="jd-kv">
            <Pair k="시각" v={kst(t.entryAt)} />
            <Pair k="가격" v={price(t.entryPrice)} />
          </dl>
          {d?.whale ? (
            <ul className="jd-list st-line">
              <li>
                <span>
                  고래 {d.whale.short} {d.whale.event === "increase" ? "추가" : d.whale.event === "open" ? "진입" : d.whale.event ?? ""}
                </span>
                <span>{d.whale.sizeUsd !== null ? `$${Math.round(d.whale.sizeUsd / 1e3)}K` : "—"}</span>
              </li>
              <li>
                <span>고래 체결 뒤 우리 진입</span>
                <span>{d.whale.delaySec !== null ? `${(d.whale.delaySec / 60).toFixed(1)}분` : "—"}</span>
              </li>
              <li>
                <span>가격 이탈 (손절폭 대비)</span>
                <span>{d.whale.driftPctOfStop !== null ? `${d.whale.driftPctOfStop.toFixed(1)}%` : "—"}</span>
              </li>
            </ul>
          ) : null}
          {d && d.reasons.length ? (
            <ul className="jd-list st-line">
              {d.reasons.map((r, i) => (
                <li key={i}>
                  <span>
                    <Glossed text={claimText(r.claim)} />
                  </span>
                  <span className="rs-days">{engineLabel(r.engine)}</span>
                </li>
              ))}
            </ul>
          ) : !d?.whale ? (
            <p className="sh-note">FCE 가 이 거래의 진입 근거를 남기지 않았다.</p>
          ) : null}
        </Card>

        <Card title="청산">
          <dl className="jd-kv">
            <Pair k="시각" v={kst(t.exitAt)} />
            <Pair k="가격" v={price(t.exitPrice)} />
            <Pair k="사유" v={`${CATEGORY_LABEL[t.category]} · ${exitLabel(t.exitReason)}`} />
            {d?.partial ? <Pair k="부분 익절" v={`${kst(d.partial.at)} · ${price(d.partial.price)}`} /> : null}
          </dl>
        </Card>

        <Card title="비용" info={<p>FCE 가 수수료와 펀딩비를 한 칸(`costs_usdt`)으로 준다 — 나눠 지어내지 않는다.</p>}>
          <dl className="jd-kv">
            <Pair k="비용 전" v={money(t.grossPnlUsdt, "USDT")} />
            <Pair k="수수료·펀딩" v={money(t.costsUsdt === null ? null : -Math.abs(t.costsUsdt), "USDT")} />
            <Pair k="순손익" v={money(t.netPnlUsdt, "USDT")} />
            <Pair k="증거금" v={money(t.marginUsdt, "USDT")} />
          </dl>
        </Card>

        <Card title="당시 조건">
          {stance ? (
            <div className="sh-inline">
              <Pill tone={stance.tone}>{stance.label}</Pill>
            </div>
          ) : null}
          {d && d.checklist.length ? (
            <ul className="jd-list st-line">
              {d.checklist.map((c, i) => (
                <li key={i} className={c.status === "fail" ? "is-fail" : c.status === "pass" ? undefined : "is-mute"}>
                  <span>{c.label}</span>
                  <span>{CHECK[c.status] ?? c.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sh-note">FCE 가 진입 조건을 남기지 않았다.</p>
          )}
        </Card>
      </div>

      {data.liquidation ? <LiquidationCard l={data.liquidation} /> : null}

      <Card title="사후 채점" description="청산 7일 뒤 가격 · 포지션 방향 기준">
        {p ? (
          <>
            <p className="jd-post">
              {price(p.price)}{" "}
              <span className={`is-${p.verdict === "favorable" ? "up" : p.verdict === "adverse" ? "dn" : "mute"}`}>
                ({pct(p.movePct, 1)})
              </span>
            </p>
            {data.postExitLine ? <p className="ps-watch">→ {data.postExitLine}</p> : null}
          </>
        ) : (
          <p className="sh-note">청산 뒤 시세를 못 받았어요.</p>
        )}
      </Card>
    </PageFrame>
  );
}

function ChartCard({ data }: { data: Detail }) {
  const t = data.trade;
  const d = data.detail;
  const entry = t.entryAt ? Math.floor(Date.parse(t.entryAt) / 1000) : null;
  const exit = t.exitAt ? Math.floor(Date.parse(t.exitAt) / 1000) : null;
  // 보유 기간 앞뒤로 여유를 둔다 — 4시간봉 기준 앞 2일 · 뒤 7일(사후 채점 창).
  const tf = t.timeframe ?? "4h";
  const from = (entry ?? exit ?? 0) - 48 * HOUR;
  const to = Math.min(Math.floor(Date.now() / 1000), (exit ?? entry ?? 0) + 7 * 24 * HOUR);
  const state = useBitgetCandles(t.symbol, tf, from, to);
  const long = !(t.direction === "short" || t.direction === "SHORT");
  const markers = useMemo<ChartMarker[]>(
    () =>
      [
        entry ? { at: entry, label: "진입", tone: "blue" as const, place: long ? ("below" as const) : ("above" as const) } : null,
        exit
          ? {
              at: exit,
              label: "청산",
              tone: (t.netPnlUsdt ?? 0) >= 0 ? ("up" as const) : ("dn" as const),
              place: long ? ("above" as const) : ("below" as const),
            }
          : null,
      ].filter((m): m is ChartMarker => m !== null),
    [entry, exit, long, t.netPnlUsdt]
  );
  const lines = useMemo<PriceLine[]>(() => {
    const out: PriceLine[] = [];
    if (t.entryPrice !== null) out.push({ price: t.entryPrice, label: "진입", tone: "blue", dashed: true });
    if (d?.levels.invalidation != null) out.push({ price: d.levels.invalidation, label: "무효화", tone: "dn" });
    if (d?.levels.takeProfit1 != null) out.push({ price: d.levels.takeProfit1, label: "익절1", tone: "up" });
    return out;
  }, [t.entryPrice, d?.levels.invalidation, d?.levels.takeProfit1]);

  return (
    <Card title="차트" description={`${tf} · 진입 ▲ · 청산 ▼`} info={<p>캔들은 Bitget 공개 시세다. 선은 FCE 가 진입 때 정한 값이다.</p>}>
      {state.kind === "ready" ? (
        <CandleChart candles={state.candles} lines={lines} markers={markers} height={320} />
      ) : state.kind === "loading" ? (
        <div className="ui-candles" style={{ height: 320 }} />
      ) : (
        <Empty title="시세를 못 받았어요" reason="Bitget 이 이 심볼 · 기간의 캔들을 주지 않았습니다." />
      )}
    </Card>
  );
}

const OUTCOME: Record<string, string> = {
  unchanged: "그대로",
  liquidation: "청산됐다",
  stop_before_liquidation: "손절이 먼저",
};

/** ENG-01 — 이 거래를 Bitget 청산 규칙으로 다시 돌린 결과. 기록(위 손익)은 그대로다. */
function LiquidationCard({ l }: { l: NonNullable<Detail["liquidation"]> }) {
  return (
    <Card
      title="청산 모델"
      description="Bitget 격리 · 기록과 따로"
      info={
        <p>
          진입 때 청산가는 Bitget 격리 공식(명목 단계 유지증거금률 · 테이커 0.06%)이다. 보유 중에는 펀딩을 증거금에서 빼며
          봉마다 다시 쟀다. 최근접은 봉 저가(숏은 고가)가 청산가에 가장 가까이 간 가격 거리다.
        </p>
      }
    >
      <dl className="jd-kv">
        <Pair k="진입 때 청산가" v={price(l.entryLiquidationPrice)} />
        <Pair k="최근접 거리" v={l.closestLiquidationPct === null ? "—" : `${l.closestLiquidationPct.toFixed(1)}%`} />
        <Pair k="청산 반영" v={`${OUTCOME[l.outcome] ?? l.outcome} · ${money(l.rescoredNetUsdt, "USDT")}`} />
        <Pair k="1배였으면" v={`${OUTCOME[l.at1x.outcome] ?? l.at1x.outcome} · ${money(l.at1x.rescoredNetUsdt, "USDT")}`} />
      </dl>
    </Card>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
