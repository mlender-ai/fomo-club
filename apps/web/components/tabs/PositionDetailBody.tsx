"use client";

/**
 * 포지션 상세 본문 (UI-06 PART B).
 *
 * ```
 * ① Hero — TRUMPUSDT · 롱 · 3배   −1.95%   진입 2.146 · 현재 2.134
 * ② 가격 레일 — 무효화 ← 현재 → 익절1 · 각 선까지 거리       ← 미니멀은 여기까지
 * ③ 캔들 차트 — 15M · 1H · 4H · 1D · 진입(파랑 점선) · 무효화(빨강) · 익절(초록)
 * ④⑤ FCE 라이브 전용 — 패턴 시간봉 · 고래 추적군 · 건강도 · 지금 볼 것 · 유효 시간 (페이퍼에는 없다)
 * ⑥ 포지션 정보
 * ⑦ 연결된 연구
 * ```
 *
 * **지금 볼 것이 없다.** FCE 가 그 한 줄을 라이브 계좌 포지션에만 만든다. 그 자리에 FCE 가 페이퍼에
 * 내는 것 중 가장 가까운 것 — **무효화·익절까지 남은 거리** — 를 레일 바로 아래 둔다. 지어내지 않는다.
 */
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

import { PageFrame } from "../shell/PageFrame";
import { ModeToggle, useViewMode } from "../shell/useViewMode";
import {
  CandleChart,
  Card,
  Empty,
  Glossed,
  HealthRing,
  Hero,
  Pill,
  PriceRail,
  ResearchItem,
  kstStamp,
  money,
  pct,
  price,
  termsIn,
  tone,
  type PriceLine,
  type ResearchStatus,
} from "../ui";
import { claimText, engineLabel, sideLabel, stanceLabel } from "../../lib/lab/labels";
import type { PositionDetail } from "../../lib/lab/positions";
import type { Jsonify } from "../../lib/lab/wire";
import { LiveOnlyCard } from "./PositionsBody";

type Detail = Jsonify<PositionDetail>;
const TIMEFRAMES = [
  { key: "15m", label: "15M" },
  { key: "1h", label: "1H" },
  { key: "4h", label: "4H" },
  { key: "1d", label: "1D" },
] as const;
type Tf = (typeof TIMEFRAMES)[number]["key"];

export function PositionDetailBody({ data }: { data: Detail }) {
  const p = data.position;
  const [mode, setMode] = useViewMode();
  const stance = stanceLabel(p.stance, p.direction);
  const title = `${p.symbol} · ${sideLabel(p.direction)}${p.leverage ? ` · ${p.leverage}배` : ""}`;

  return (
    <PageFrame
      title={p.symbol}
      description={
        <>
          <Link href="/positions">포지션</Link> · {p.strategy} · 페이퍼
        </>
      }
      info={
        <>
          <p>손익은 증거금 대비이고 수수료·펀딩이 들어 있다. FCE 가 현재가로 잰 값이다(`exit_monitor`).</p>
          <p>{data.caveat}</p>
          <p>무효화·익절은 FCE 페이퍼 전략이 진입할 때 정한 선이다. 랩이 다시 계산하지 않는다.</p>
        </>
      }
    >
      <ModeToggle mode={mode} onChange={setMode} />

      {/* ① Hero */}
      <Hero
        label={title}
        value={<span className={`ui-num is-${tone(p.netReturnPct)}`}>{pct(p.netReturnPct)}</span>}
        meta="증거금 대비 · 비용 포함"
      />
      <div className="sh-inline">
        <HealthRing score={p.healthScore} size={36} />
        {p.liquidationLevel ? <Pill tone="dn">청산 위험</Pill> : null}
        {stance ? <Pill tone={stance.tone}>{stance.label}</Pill> : null}
      </div>
      <p className="st-line">
        진입 {price(p.entryPrice)} · 현재 {price(p.markPrice)}
        {data.lastAt ? ` · ${kstStamp(data.lastAt).slice(-5)} 기준` : ""}
      </p>

      {/* ② 가격 레일 + (지금 볼 것 자리) */}
      <Card title="가격 레일">
        {p.rail ? (
          <>
            <PriceRail rail={p.rail} mark={p.markPrice} takeProfit={p.takeProfitPrice} />
            <p className="ps-watch">
              {p.rail.beyond === "invalidation"
                ? "무효화선을 넘었다"
                : p.rail.beyond === "take_profit"
                  ? "익절1 선을 넘었다"
                  : `${p.rail.moved ? "손절" : "무효화"}까지 ${pct(p.invalidationDistancePct)} · 익절1까지 ${pct(p.takeProfitDistancePct)}`}
            </p>
            {p.rail.moved ? (
              <p className="st-line">{`무효화 ${price(p.invalidationPrice)} → 손절 ${price(p.stopPrice)}`}</p>
            ) : null}
            {p.takeProfit2Price !== null ? <p className="st-line">익절2 {price(p.takeProfit2Price)}</p> : null}
          </>
        ) : (
          <p className="sh-note">FCE 가 이 포지션에 가격선을 주지 않았다.</p>
        )}
      </Card>

      {mode === "pro" ? (
        <>
          {/* ③ 차트 */}
          <ChartCard data={data} />

          {/* 진입 근거 — FCE 페이퍼 화면에 있는 것 */}
          <EvidenceCard p={p} />

          {/* ④⑤ 라이브 전용 */}
          <LiveOnlyCard names={data.liveOnly} />

          {/* ⑥ 정보 */}
          <InfoCard p={p} />

          {/* ⑦ 연구 */}
          {p.research.length > 0 ? (
            <Card title="연결된 연구" aside={<Link href="/research">전부</Link>} flush>
              <ul className="ui-research">
                {p.research.map((r) => (
                  <ResearchItem
                    key={r.no}
                    no={r.no}
                    title={r.title}
                    status={r.status as ResearchStatus}
                    blocks={r.blocks}
                    href={`/research/${r.no}`}
                  />
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </PageFrame>
  );
}

function ChartCard({ data }: { data: Detail }) {
  const p = data.position;
  const available = TIMEFRAMES.filter((t) => (data.chart[t.key]?.length ?? 0) > 0);
  // FCE 페이퍼가 이 포지션을 판정한 시간봉에서 연다.
  const first = (available.find((t) => t.key === p.timeframe) ?? available[0])?.key ?? "4h";
  const [tf, setTf] = useState<Tf>(first);
  const candles = data.chart[tf] ?? [];
  const lines = useMemo<PriceLine[]>(() => {
    const out: PriceLine[] = [];
    if (p.entryPrice !== null) out.push({ price: p.entryPrice, label: "진입", tone: "blue", dashed: true });
    if (p.invalidationPrice !== null) out.push({ price: p.invalidationPrice, label: "무효화", tone: "dn" });
    // 부분 익절 뒤 올라간 손절선 — 무효화와 다를 때만 따로 긋는다.
    if (p.stopPrice !== null && p.stopPrice !== p.invalidationPrice) {
      out.push({ price: p.stopPrice, label: "손절", tone: "dn", dashed: true });
    }
    if (p.takeProfitPrice !== null) out.push({ price: p.takeProfitPrice, label: "익절1", tone: "up" });
    if (p.takeProfit2Price !== null) out.push({ price: p.takeProfit2Price, label: "익절2", tone: "up" });
    return out;
  }, [p.entryPrice, p.invalidationPrice, p.stopPrice, p.takeProfitPrice, p.takeProfit2Price]);

  return (
    <Card
      title="차트"
      description="점선 진입 · 빨강 무효화 · 초록 익절"
      info={
        <p>
          캔들은 Bitget 공개 시세다(시장 데이터 · 계좌와 무관). Mac 업로더가 15분마다 받아 올린다
          {data.chartAsOf ? ` — 마지막 ${kstStamp(data.chartAsOf)}` : ""}. 선은 FCE 페이퍼의 값이다.
        </p>
      }
    >
      {/* 시간봉 탭은 본문에 — 제목 줄 옆에 두면 폰에서 부제와 탭이 둘 다 두 줄로 접혔다. */}
      {available.length > 0 ? (
        <div className="ui-ranges ps-tf" role="tablist" aria-label="시간봉">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tf}
              disabled={!available.some((a) => a.key === t.key)}
              className={`ui-range${t.key === tf ? " is-on" : ""}`}
              onClick={() => setTf(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      {candles.length > 0 ? (
        <CandleChart candles={candles as [number, number, number, number, number][]} lines={lines} />
      ) : (
        <Empty title="캔들이 아직 없어요" reason="다음 업로드에 올라옵니다." />
      )}
    </Card>
  );
}

function EvidenceCard({ p }: { p: Detail["position"] }) {
  if (p.evidence.length === 0) return null;
  const claims = p.evidence.map((e) => claimText(e.claim));
  const terms = termsIn(claims);
  return (
    <Card
      title="진입 근거"
      description="FCE 가 진입할 때 적은 것"
      flush
      info={
        terms.length > 0 ? (
          <dl>
            {terms.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
        ) : undefined
      }
    >
      <ul className="ps-why">
        {p.evidence.map((e, i) => (
          <li key={i}>
            <span className="ps-why-claim">
              <Glossed text={claims[i] as string} />
            </span>
            <span className="ps-why-meta">
              {engineLabel(e.engine)}
              {e.confidence !== null ? ` · 확신 ${Math.round(e.confidence)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InfoCard({ p }: { p: Detail["position"] }) {
  const rows: [string, string][] = [
    ["진입", `${p.entryAt ? kstStamp(p.entryAt) : "—"} · ${price(p.entryPrice)}`],
    ["수량", p.quantity === null ? "—" : `${p.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${p.symbol.replace(/USDT$/, "")}`],
    ["명목", money(p.notionalUsdt, "USDT")],
    ["증거금", money(p.marginUsdt, "USDT")],
    ["레버리지", p.leverage ? `${p.leverage}배` : "—"],
    // FCE 가 수수료와 펀딩을 한 칸으로 준다 — 나눠 쓰지 않는다.
    ["수수료·펀딩 누적", p.costsUsdt === null ? "—" : money(-Math.abs(p.costsUsdt), "USDT")],
    ["미실현", money(p.unrealizedUsdt, "USDT")],
    ["시간봉", p.timeframe ?? "—"],
    ["전략", p.strategy],
  ];
  return (
    <Card title="포지션 정보">
      <dl className="ps-info">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function PositionMissing({ id }: { id: string }) {
  return (
    <PageFrame title="포지션">
      <Empty
        title="닫힌 포지션이에요"
        reason={`'${id}' 는 지금 열려 있지 않습니다. 닫힌 거래는 복기에 있습니다.`}
        action={<Link href="/journal">복기로</Link>}
      />
    </PageFrame>
  );
}
