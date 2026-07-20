import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { readQualityLedger, type QualityLedgerEntry } from "../../../lib/quality-slo-ledger";

const PASS = "#d8ff3a";
const FAIL = "#f07a6a";
const MUTED = "#8a8f98";
const HAIRLINE = "#25262a";

function percent(value: number): string {
  return `${Math.round(value * 1_000) / 10}%`;
}

function TrendChart({
  title,
  entries,
  value,
  target,
  max,
  lowerIsBetter = false,
  format = (number) => String(Math.round(number * 100) / 100),
}: {
  title: string;
  entries: readonly QualityLedgerEntry[];
  value: (entry: QualityLedgerEntry) => number;
  target: number;
  max: number;
  lowerIsBetter?: boolean;
  format?: (value: number) => string;
}) {
  const width = 620;
  const height = 150;
  const pad = 24;
  const range = Math.max(max, target, ...entries.map(value), 1);
  const point = (entry: QualityLedgerEntry, index: number) => {
    const x = entries.length <= 1 ? width / 2 : pad + (index / (entries.length - 1)) * (width - pad * 2);
    const y = height - pad - (Math.max(0, value(entry)) / range) * (height - pad * 2);
    return { x, y, raw: value(entry), passed: lowerIsBetter ? value(entry) <= target : value(entry) >= target };
  };
  const points = entries.map(point);
  const targetY = height - pad - (target / range) * (height - pad * 2);
  const path = points.map((item, index) => `${index === 0 ? "M" : "L"}${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ");
  const latest = points.at(-1);
  return (
    <section style={{ minWidth: 0, padding: "18px 0", borderTop: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>{title}</h2>
        <span style={{ color: latest?.passed ? PASS : FAIL, fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {latest ? format(latest.raw) : "-"}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} 일별 추이`} style={{ display: "block", width: "100%", height: 150, marginTop: 10 }}>
        <line x1={pad} y1={targetY} x2={width - pad} y2={targetY} stroke="#59606b" strokeDasharray="5 5" />
        <text x={width - pad} y={Math.max(12, targetY - 6)} textAnchor="end" fill={MUTED} fontSize="10">목표 {format(target)}</text>
        {path && <path d={path} fill="none" stroke="#f4f5f7" strokeWidth="2" />}
        {points.map((item, index) => (
          <circle key={`${entries[index]!.date}-${title}`} cx={item.x} cy={item.y} r="4" fill={item.passed ? PASS : FAIL} />
        ))}
        {entries.map((entry, index) => {
          if (entries.length > 8 && index % Math.ceil(entries.length / 6) !== 0 && index !== entries.length - 1) return null;
          return <text key={entry.date} x={points[index]!.x} y={height - 5} textAnchor="middle" fill={MUTED} fontSize="9">{entry.date.slice(5)}</text>;
        })}
      </svg>
    </section>
  );
}

function cell(passed: boolean): CSSProperties {
  return {
    padding: "12px 10px",
    color: passed ? "#d5d7dc" : FAIL,
    background: passed ? "transparent" : "#241315",
    borderBottom: `1px solid ${HAIRLINE}`,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    whiteSpace: "nowrap",
  };
}

export default async function QualitySloPage() {
  const password = process.env.DASHBOARD_PASSWORD;
  const session = (await cookies()).get("dashboard_session")?.value;
  if (!password || session !== password) redirect("/login");
  const newest = await readQualityLedger(45).catch(() => [] as QualityLedgerEntry[]);
  const entries = [...newest].reverse();
  const latest = newest[0];

  return (
    <main style={{ minHeight: "100vh", padding: "28px clamp(18px, 4vw, 56px)", background: "#050506", color: "#f4f5f7" }}>
      <header style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 24, borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 18 }}>
        <div>
          <p className="eyebrow">FOMO CLUB / QUALITY LEDGER</p>
          <h1 style={{ marginTop: 8, fontSize: 28 }}>품질 SLO 원장</h1>
        </div>
        <nav style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <Link href="/admin/committee" style={{ color: MUTED }}>위원회</Link>
          <Link href="/admin/quality" style={{ color: PASS }}>품질 SLO</Link>
        </nav>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", borderBottom: `1px solid ${HAIRLINE}` }}>
        {[
          ["최신 날짜", latest?.date ?? "-"],
          ["상태", latest ? (latest.passed ? "PASS" : "MISSED") : "NO DATA"],
          ["미달", latest?.failures.join(" · ") || "0"],
          ["기록 일수", newest.length],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ padding: "18px 16px", borderRight: `1px solid ${HAIRLINE}` }}>
            <div className="eyebrow">{label}</div>
            <div style={{ marginTop: 8, color: label === "상태" ? (latest?.passed ? PASS : FAIL) : "inherit", fontFamily: "var(--font-mono)", fontSize: 16 }}>{String(value)}</div>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", columnGap: 28, paddingTop: 8 }}>
        <TrendChart title="원인 설명률" entries={entries} value={(entry) => entry.metrics.causeExplanation.ratio} target={0.9} max={1} format={percent} />
        <TrendChart title="시세 성공률" entries={entries} value={(entry) => entry.metrics.marketData.ratio} target={1} max={1} format={percent} />
        <TrendChart title="verdict 문장 유니크" entries={entries} value={(entry) => entry.metrics.verdict.uniqueTextCount} target={10} max={30} />
        <TrendChart title="최다 문장 반복" entries={entries} value={(entry) => entry.metrics.templateDiversity.maxRepeatCount} target={3} max={12} lowerIsBetter />
        <TrendChart title="전일 중복률" entries={entries} value={(entry) => entry.metrics.freshness.repeatRatio} target={0.5} max={1} lowerIsBetter format={percent} />
        <TrendChart title="뎁스 완결률" entries={entries} value={(entry) => entry.metrics.depthCoverage.ratio} target={0.9} max={1} format={percent} />
      </section>

      <section style={{ padding: "24px 0" }}>
        <p className="eyebrow">DAILY SLO MATRIX</p>
        <div style={{ marginTop: 12, overflowX: "auto", borderTop: `1px solid ${HAIRLINE}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
            <thead>
              <tr>{["날짜", "원인", "시세", "verdict", "반복", "신선도", "자산", "위원회", "뎁스"].map((label) => <th key={label} style={{ padding: "10px", textAlign: "left", color: MUTED, fontSize: 10 }}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {newest.map((entry) => (
                <tr key={entry.date}>
                  <td style={cell(entry.passed)}>{entry.date}</td>
                  <td style={cell(entry.metrics.causeExplanation.passed)}>{percent(entry.metrics.causeExplanation.ratio)} ({entry.metrics.causeExplanation.explained}/{entry.metrics.causeExplanation.movers})</td>
                  <td style={cell(entry.metrics.marketData.passed)}>{percent(entry.metrics.marketData.ratio)} ({entry.metrics.marketData.pricedAndCharted}/{entry.metrics.marketData.cards})</td>
                  <td style={cell(entry.metrics.verdict.passed)}>유니크 {entry.metrics.verdict.uniqueTextCount} · W {percent(entry.metrics.verdict.watchRatio)}</td>
                  <td style={cell(entry.metrics.templateDiversity.passed)}>최다 {entry.metrics.templateDiversity.maxRepeatCount}회</td>
                  <td style={cell(entry.metrics.freshness.passed)}>{percent(entry.metrics.freshness.repeatRatio)}</td>
                  <td style={cell(entry.metrics.assets.passed)}>KR {entry.metrics.assets.kr} · US {entry.metrics.assets.us} · C {entry.metrics.assets.coin}</td>
                  <td style={cell(entry.metrics.committee.passed)}>{entry.metrics.committee.published ? "발행" : "미발행"} · 반려 {entry.metrics.committee.rejectedCount ?? "-"} · 폐기 {entry.metrics.committee.factGateDiscardCount ?? "-"}</td>
                  <td style={cell(entry.metrics.depthCoverage.passed)}>{percent(entry.metrics.depthCoverage.ratio)} ({entry.metrics.depthCoverage.complete}/{entry.metrics.depthCoverage.cards})</td>
                </tr>
              ))}
              {newest.length === 0 && <tr><td colSpan={9} style={{ padding: 18, color: MUTED }}>품질 원장 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
