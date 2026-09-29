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
  usdCompact,
  type PriceLine,
  type ResearchStatus,
} from "../ui";
import { claimText, engineLabel, phaseLabel, sideLabel, stanceLabel, verdictLabel } from "../../lib/lab/labels";
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
  const [tf, setTf] = useState<Tf>(() => firstTimeframe(data));
  const a = p.analysis;

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
        {a?.statusLabel ? <Pill tone={a.statusLabel.includes("위험") ? "dn" : "warn"}>{a.statusLabel}</Pill> : null}
        {p.liquidationLevel ? <Pill tone="dn">청산 위험</Pill> : null}
        {stance ? <Pill tone={stance.tone}>{stance.label}</Pill> : null}
      </div>
      <p className="st-line">
        진입 {price(p.entryPrice)} · 현재 {price(p.markPrice)}
        {data.lastAt ? ` · ${kstStamp(data.lastAt).slice(-5)} 기준` : ""}
      </p>

      {/* ② 지금 볼 것 — FCE 포지션 분석(라이브 화면과 같은 함수). **가장 먼저 눈에 들어와야 한다**(UI-06 B-3). */}
      {a?.headline ? <WatchCard a={a} /> : null}

      {/* 가격 레일 */}
      <Card title="가격 레일">
        {p.rail ? (
          <>
            <PriceRail
              rail={p.rail}
              mark={p.markPrice}
              takeProfit={p.takeProfitPrice}
              liquidation={
            p.liquidationPrice != null
              ? { price: p.liquidationPrice, distancePct: p.liquidationDistancePct ?? null, near: p.liquidationLevel }
              : null
          }
            />
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
          <ChartCard data={data} tf={tf} setTf={setTf} />

          {/* ④ 패턴 시간봉 — 누르면 차트 시간봉이 바뀐다 */}
          {a ? <PatternCard a={a} tf={tf} setTf={setTf} available={TIMEFRAMES.filter((t) => (data.chart[t.key]?.length ?? 0) > 0).map((t) => t.key)} /> : null}

          {/* ⑤ 고래 추적군 */}
          <CohortCard p={p} />

          {/* 진입 근거 — FCE 페이퍼 화면에 있는 것 */}
          <EvidenceCard p={p} />

          {/* 분석을 못 돌린 포지션만 — 무엇이 없는지 이름으로 */}
          {data.liveOnly.length > 0 ? <LiveOnlyCard names={data.liveOnly} /> : null}

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

/** 이 포지션을 처음 열 시간봉 — FCE 페이퍼가 판정한 시간봉, 없으면 캔들이 있는 첫 시간봉. */
function firstTimeframe(data: Detail): Tf {
  const available = TIMEFRAMES.filter((t) => (data.chart[t.key]?.length ?? 0) > 0);
  return (available.find((t) => t.key === data.position.timeframe) ?? available[0])?.key ?? "4h";
}

function ChartCard({ data, tf, setTf }: { data: Detail; tf: Tf; setTf: (t: Tf) => void }) {
  const p = data.position;
  const available = TIMEFRAMES.filter((t) => (data.chart[t.key]?.length ?? 0) > 0);
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

/** FCE 가 이 분석을 한 지 몇 분 — 30분이 유효 창이다(FCE 라이브 화면 `freshnessCountdownLabel` 과 같은 규칙). */
export function validityLabel(asOf: string, now = Date.now()): { label: string; expired: boolean } {
  const age = (now - Date.parse(asOf)) / 60_000;
  const remaining = Math.ceil(30 - age);
  // 알약은 6자 — FCE 의 "유효 N분 남음" 을 "유효 N분" 으로.
  if (remaining > 0) return { label: `유효 ${remaining}분`, expired: false };
  // 지난 것은 **분석한 지 얼마나 됐나**로 — "1810분 지남" 은 7자였다(분석이 30시간 묵었을 때).
  const m = Math.floor(age);
  const label = m < 60 ? `${m}분 전` : m < 24 * 60 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
  return { label, expired: true };
}

function WatchCard({ a }: { a: NonNullable<Detail["position"]["analysis"]> }) {
  const v = validityLabel(a.asOf);
  const text = (a.headline ?? "").replace(/^지금 볼 것:\s*/, "");
  return (
    <Card
      title="지금 볼 것"
      aside={<Pill tone={v.expired ? "mute" : "blue"}>{v.label}</Pill>}
      info={
        <>
          <p>
            FCE 가 라이브 계좌 포지션에 쓰는 분석 함수를 이 페이퍼 포지션에 돌린 결과다(`build_action_plan` · 건강도 · 판정). 랩이
            만든 문장이 아니다. 분석은 30분 동안 유효하다 — FCE 라이브 화면과 같은 규칙.
          </p>
          <p>분석의 무효화 · 익절 후보는 FCE 의 구조 레벨이다. 아래 가격 레일은 FCE 페이퍼 전략이 진입 때 정한 선이다.</p>
        </>
      }
    >
      <p className="ps-watch">{text}</p>
      {a.verdictState ? <p className="st-line">{verdictLabel(a.verdictState)}</p> : null}
      {a.watch.length ? (
        <ul className="jd-list st-line">
          {a.watch.map((w, i) => (
            <li key={i}>
              <span>{w.condition}</span>
              <span className="rs-days">{w.meaning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

const PATTERN_TF: Record<string, string> = { "1d": "1D", "12h": "12H", "4h": "4H", "1h": "1H", "15m": "15M" };

function PatternCard({
  a,
  tf,
  setTf,
  available,
}: {
  a: NonNullable<Detail["position"]["analysis"]>;
  tf: Tf;
  setTf: (t: Tf) => void;
  available: string[];
}) {
  return (
    <Card
      title="패턴 시간봉"
      description="시간봉마다 확정 캔들을 따로 검사"
      info={<p>FCE `build_pattern_matrix` 의 결과다 — 와이코프 국면 · 하모닉 패턴. 누르면 차트가 그 시간봉으로 바뀐다(12H 는 차트 캔들이 없다).</p>}
    >
      <ul className="ps-patterns">
        {a.patterns.map((r) => {
          const found = r.status === "ok" && (r.wyckoffDetected || r.harmonicCount > 0);
          const clickable = available.includes(r.timeframe);
          const phase = phaseLabel(r.status === "ok" ? r.wyckoffPhase : "unavailable");
          const body = (
            <>
              <span className="ps-pattern-tf">{PATTERN_TF[r.timeframe] ?? r.timeframe}</span>
              <span className="ps-pattern-phase">
                <Glossed text={phase} />
              </span>
              <span className="ps-pattern-sub">
                {r.harmonic ? (
                  <>
                    <Glossed text={r.harmonic} /> {r.harmonicScore ?? ""}
                  </>
                ) : r.rangeDetected ? (
                  "레인지 확인"
                ) : r.status === "ok" ? (
                  `하모닉 ${r.harmonicCount}`
                ) : (
                  "데이터 없음"
                )}
              </span>
            </>
          );
          return (
            <li key={r.timeframe} className={`ps-pattern${found ? " is-found" : ""}${r.status !== "ok" ? " is-off" : ""}${tf === r.timeframe ? " is-on" : ""}`}>
              {clickable ? (
                <button type="button" onClick={() => setTf(r.timeframe as Tf)} aria-pressed={tf === r.timeframe}>
                  {body}
                </button>
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CohortCard({ p }: { p: Detail["position"] }) {
  const c = p.cohort;
  const long = !(p.direction === "short" || p.direction === "SHORT");
  if (!c) {
    return (
      <Card title="고래 추적군" description="FCE 추적군 · 지금 미결제">
        <p className="sh-note">추적군이 이 심볼을 들고 있지 않다.</p>
      </Card>
    );
  }
  const total = c.longUsd + c.shortUsd;
  const longPct = total > 0 ? (c.longUsd / total) * 100 : 0;
  const net = c.longUsd === c.shortUsd ? null : c.longUsd > c.shortUsd ? "long" : "short";
  const aligned = net === null ? null : (net === "long") === long;
  return (
    <Card
      title="고래 추적군"
      description={`${c.longWallets + c.shortWallets}지갑 · 추적군 ${c.tracked ?? "—"}개 중`}
      info={<p>FCE 추적군(리더보드 상위 지갑)이 이 심볼에 지금 든 미결제다. 관측 정보이며 방향 판정이 아니다 — FCE 도 그렇게 적는다.</p>}
    >
      <StatGroupLite
        items={[
          ["추적군 롱", usdCompact(c.longUsd), `${c.longWallets}지갑`],
          ["추적군 숏", usdCompact(c.shortUsd), `${c.shortWallets}지갑`],
          ["분포", `롱 ${Math.round(longPct)}%`, ""],
          ["내 포지션 대비", aligned === null ? "—" : aligned ? "정렬" : "역행", "관측 · 판정 아님"],
        ]}
      />
      <div className="ps-cohort-bar" aria-hidden>
        <span style={{ width: `${longPct}%` }} />
      </div>
    </Card>
  );
}

function StatGroupLite({ items }: { items: [string, string, string][] }) {
  return (
    <dl className="ps-info">
      {items.map(([k, v, n]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>
            {v}
            {n ? <span className="rs-days"> · {n}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
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
