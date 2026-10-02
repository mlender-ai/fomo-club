"use client";

/**
 * `/me/compare` 본문 (TRADER-03 PART A ~ D).
 *
 * ```
 * 광혁 vs 엔진                     [30일][90일][180일]
 * 광혁이 이기고 있다                ← 결론 먼저
 * 같은 기간 순손익 …
 * ┌ 비교표 ┐ 첫 열 광혁 고정 · 폰은 가로 스크롤
 * 가장 큰 차이 한 줄
 * 누적 곡선(시작 1,000) · 일별 손익 나란히 · 손익 분포 · 같은 순간
 * ```
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { fmt, type CompareView, type Kind } from "../../lib/me/compare";
import { Card } from "../ui";

const PERIODS = [30, 90, 180];
const LINE_COLOR: Record<Kind, string> = { account: "var(--ink)", replica: "var(--warn)", engine: "var(--ink-3)", btc: "var(--ink-3)" };
const ENGINE_PALETTE = ["#4f6bed", "#0f9d8a", "#b25e09", "#8a4fff"];

function signed(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

function kstDate(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");
}

export function CompareBody({ view }: { view: CompareView }) {
  const engineColor = useMemo(() => {
    const out: Record<string, string> = {};
    view.columns.filter((c) => c.kind === "engine").forEach((c, i) => (out[c.key] = ENGINE_PALETTE[i % ENGINE_PALETTE.length] as string));
    return out;
  }, [view.columns]);
  const color = (key: string, kind: Kind) => engineColor[key] ?? LINE_COLOR[kind];

  return (
    <div className="me-page">
      <header className="me-head">
        <div className="me-head-row">
          <p className="me-eyebrow">광혁 vs 엔진</p>
          <nav className="me-periods" aria-label="기간">
            {PERIODS.map((d) => (
              <Link key={d} href={`/me/compare?days=${d}`} className={`me-period${view.days === d ? " is-on" : ""}`} aria-current={view.days === d ? "page" : undefined}>
                {d}일
              </Link>
            ))}
          </nav>
        </div>
        <h1 className="me-display">{view.headline.text}</h1>
        {view.headline.netLine ? <p className="me-netline">{view.headline.netLine}</p> : null}
        {view.accountAsOf ? <p className="me-asof">실계좌 기준 {kstDate(view.accountAsOf)} KST · % 는 시간가중(입출금 제거)</p> : null}
      </header>

      <Card title="비교표" flush description="광혁 실계좌가 기준 — 광혁보다 나쁘면 빨강, 좋으면 초록(BTC 열 제외)">
        <div className="me-table-wrap">
          <table className="me-table">
            <thead>
              <tr>
                <th className="me-sticky me-sticky-0" scope="col" />
                {view.columns.map((c, i) => (
                  <th key={c.key} scope="col" className={i === 0 ? "me-sticky me-sticky-1 me-base" : undefined}>
                    <span className="me-col-label">{c.label}</span>
                    <span className="me-col-sub">{c.note ?? c.sub}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="me-sticky me-sticky-0">
                    {r.label}
                  </th>
                  {r.cells.map((cell, i) => {
                    const col = view.columns[i];
                    const pending = col?.status === "pending";
                    return (
                      <td key={col?.key ?? i} className={`${i === 0 ? "me-sticky me-sticky-1 me-base " : ""}${cell.tone === "up" ? "is-up" : cell.tone === "dn" ? "is-dn" : ""}`}>
                        {pending ? <span className="me-pending">{i === 0 ? "—" : "준비 중"}</span> : fmt(cell.value, r.unit)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.gap ? (
          <div className="me-gap">
            <p className="me-gap-1">{view.gap.line1}</p>
            <p className="me-gap-2">{view.gap.line2}</p>
          </div>
        ) : null}
      </Card>

      <Card title="누적 손익" description="같은 기간 · 시작 1,000 으로 환산 · 실계좌는 시간가중(입출금 제거)">
        {view.curve.points.length > 1 ? (
          <div className="me-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.curve.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => new Date(v).toISOString().slice(5, 10)} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis width={44} domain={["auto", "auto"]} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={false} />
                <ReferenceLine y={1000} stroke="var(--line-2)" />
                <Tooltip isAnimationActive={false} labelFormatter={(v) => new Date(Number(v)).toISOString().slice(0, 10)} formatter={(v) => (typeof v === "number" ? v.toFixed(0) : String(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {view.curve.series.map((s) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    dot={false}
                    isAnimationActive={false}
                    stroke={color(s.key, s.kind)}
                    strokeWidth={s.kind === "account" ? 3 : 1.5}
                    {...(s.kind === "btc" ? { strokeDasharray: "4 4" } : {})}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="me-empty">이 기간 곡선을 그릴 점이 없다</p>
        )}
      </Card>

      <CalendarCard view={view} />
      <DistCard view={view} />
      <OverlapCard view={view} />
    </div>
  );
}

function EngineSelect({ engines, value, onChange }: { engines: { key: string; label: string }[]; value: string; onChange: (key: string) => void }) {
  if (engines.length < 2) return null;
  return (
    <select className="me-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="견줄 엔진">
      {engines.map((e) => (
        <option key={e.key} value={e.key}>
          {e.label}
        </option>
      ))}
    </select>
  );
}

function CalendarCard({ view }: { view: CompareView }) {
  const engines = view.calendar.engines.filter((e) => e.key !== "replica").concat(view.calendar.engines.filter((e) => e.key === "replica"));
  const [engine, setEngine] = useState(engines[0]?.key ?? "");
  const label = engines.find((e) => e.key === engine)?.label ?? "엔진";
  return (
    <Card title="일별 손익" description="광혁과 엔진을 같은 날로 나란히 · 엇갈린 날(한쪽 벌고 한쪽 잃은 날)에 표시" aside={<EngineSelect engines={engines} value={engine} onChange={setEngine} />} flush>
      {view.calendar.rows.length ? (
        <div className="me-cal-wrap">
          <table className="me-cal">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">광혁</th>
                <th scope="col">{label}</th>
              </tr>
            </thead>
            <tbody>
              {view.calendar.rows.map((r) => {
                const a = r.values.account ?? null;
                const e = r.values[engine] ?? null;
                const split = a !== null && e !== null && Math.sign(a) !== Math.sign(e) && a !== 0 && e !== 0;
                return (
                  <tr key={r.day} className={split ? "is-split" : undefined}>
                    <th scope="row">{r.day.slice(5)}</th>
                    <td className={a === null ? "" : a > 0 ? "is-up" : a < 0 ? "is-dn" : ""}>{signed(a, 2)}</td>
                    <td className={e === null ? "" : e > 0 ? "is-up" : e < 0 ? "is-dn" : ""}>{signed(e, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="me-empty">이 기간 손익이 난 날이 없다</p>
      )}
    </Card>
  );
}

function DistCard({ view }: { view: CompareView }) {
  const [key, setKey] = useState(view.dist[0]?.key ?? "");
  const d = view.dist.find((x) => x.key === key) ?? view.dist[0];
  if (!d) {
    return (
      <Card title="손익 분포">
        <p className="me-empty">견줄 엔진 거래가 없다</p>
      </Card>
    );
  }
  const rows = d.bins.map((b) => ({
    mid: (b.from + b.to) / 2,
    label: b.edge === "lo" ? `≤${b.to}` : b.edge === "hi" ? `≥${b.from}` : `${b.from}`,
    광혁: Math.round(b.account * 10) / 10,
    [d.label]: Math.round(b.engine * 10) / 10,
  }));
  const width = d.bins[0] ? d.bins[0].to - d.bins[0].from : 1;
  return (
    <Card
      title="손익 분포"
      description="거래별 손익률(증거금 대비 %) · 막대 = 그 칸에 든 거래 비율 · 세로선 = 평균 이익 · 평균 손실"
      aside={<EngineSelect engines={view.dist.map((x) => ({ key: x.key, label: x.label }))} value={d.key} onChange={setKey} />}
    >
      {d.tail ? (
        <p className="me-tail">
          오른쪽 꼬리 — 증거금 <b>+{d.tail.threshold}%</b> 이상 번 거래: 광혁 <b>{d.tail.account?.toFixed(0) ?? "—"}%</b> · {d.label} <b>{d.tail.engine?.toFixed(0) ?? "—"}%</b>
        </p>
      ) : null}
      <div className="me-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={1} barGap={0}>
            <XAxis dataKey="mid" type="number" domain={[d.bins[0]?.from ?? 0, d.bins[d.bins.length - 1]?.to ?? 1]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis width={36} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "var(--ink-3)", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip isAnimationActive={false} labelFormatter={(v) => `${Number(v) - width / 2}% ~ ${Number(v) + width / 2}%`} formatter={(v) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={0} stroke="var(--line-2)" />
            {d.lines.account.win !== null ? <ReferenceLine x={d.lines.account.win} stroke="var(--ink)" strokeWidth={2} /> : null}
            {d.lines.account.loss !== null ? <ReferenceLine x={d.lines.account.loss} stroke="var(--ink)" strokeWidth={2} /> : null}
            {d.lines.engine.win !== null ? <ReferenceLine x={d.lines.engine.win} stroke="#4f6bed" strokeDasharray="4 3" /> : null}
            {d.lines.engine.loss !== null ? <ReferenceLine x={d.lines.engine.loss} stroke="#4f6bed" strokeDasharray="4 3" /> : null}
            <Bar dataKey="광혁" fill="var(--ink)" isAnimationActive={false} />
            <Bar dataKey={d.label} fill="#4f6bed" fillOpacity={0.7} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="me-legend-note">실선 = 광혁 평균 이익 · 평균 손실 · 점선 = {d.label}</p>
    </Card>
  );
}

const STATE_TEXT = { entered: "진입 ✅", holding: "보유 중", none: "진입 ❌" } as const;

function OverlapCard({ view }: { view: CompareView }) {
  const rivals = view.overlap.summary;
  return (
    <Card title="같은 순간" description="광혁이 진입한 순간 — 엔진은 그때 무엇을 했나(같은 종목 · ±1시간)">
      <ul className="me-overlap-sum">
        <li>
          광혁 진입 <b>{view.overlap.total}</b>건 중
        </li>
        {rivals.map((s) => (
          <li key={s.key}>
            {s.label} {s.key === "replica" ? "따라감" : "겹침"} <b>{s.key === "replica" ? s.entered : s.overlapped}</b>건
            {s.total ? ` (${Math.round(((s.key === "replica" ? s.entered : s.overlapped) / s.total) * 100)}%)` : ""}
          </li>
        ))}
      </ul>
      {view.overlap.rows.length ? (
        <ol className="me-overlap">
          {view.overlap.rows.map((r) => (
            <li key={`${r.at}-${r.symbol}`}>
              <p className="me-ov-head">
                <span className="me-ov-at">{kstDate(r.at)}</span> 광혁 {r.symbol.replace(/USDT$/, "")} {r.side === "long" ? "롱" : "숏"} →{" "}
                <span className={r.net > 0 ? "is-up" : r.net < 0 ? "is-dn" : ""}>{signed(r.net, 1)}</span> <span className="me-ov-hold">(보유 {r.holdH.toFixed(1)}h)</span>
              </p>
              <ul className="me-ov-cells">
                {rivals.map((s) => {
                  const c = r.cells[s.key];
                  if (!c) return null;
                  return (
                    <li key={s.key} className={`is-${c.state}`}>
                      <span className="me-ov-name">{s.label}</span> {c.state === "holding" && c.side ? `${c.side === "long" ? "롱" : "숏"} ` : ""}
                      {STATE_TEXT[c.state]}
                      {c.net !== null ? <span className={c.net > 0 ? "is-up" : c.net < 0 ? "is-dn" : ""}> → {signed(c.net, 1)}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="me-empty">이 기간 광혁 진입이 없다</p>
      )}
    </Card>
  );
}
