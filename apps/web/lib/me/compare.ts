/**
 * TRADER-03 — 광혁 vs 엔진. **순수 함수다**(DB · 시각 · 네트워크 없음). 화면 · API 가 같은 걸 부른다.
 *
 * ## 같은 잣대
 *
 * - 기간: 화면이 고른 30 · 90 · 180일. 엔진 거래도 **청산 시각**이 그 안인 것만.
 * - %: 실계좌는 **시간가중**(업로더가 장부 이체마다 끊어 곱한 지수) — 거래소 앱의 %를 쓰지 않는다.
 *   엔진은 자본곡선(`FceCapitalPoint`)의 변화 — 엔진은 입출금이 없어 시간가중과 같다.
 * - 곡선: 모두 **시작 1,000** 으로 환산(자본이 달라 절대 금액을 겹치지 않는다).
 * - 색: 광혁 열이 기준. 좋은 방향이 정해진 줄만 칠한다(거래 수 · 보유 · 레버리지는 칠하지 않는다). BTC 열은 칠하지 않는다.
 */
import type { AccountPayload, EngineInput, MeTrade, ReplicaPayload } from "./types";

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;
const MATCH_MS = 3_600_000;

export type Better = "high" | "low" | null;
export type Unit = "usdt" | "pct" | "pct0" | "x" | "n1" | "h" | "lev";

export const METRICS: { key: MetricKey; label: string; unit: Unit; better: Better }[] = [
  { key: "net", label: "순손익 (USDT)", unit: "usdt", better: "high" },
  { key: "twr", label: "수익률 (시간가중)", unit: "pct", better: "high" },
  { key: "pf", label: "PF", unit: "x", better: "high" },
  { key: "winRate", label: "승률", unit: "pct0", better: "high" },
  { key: "avgWin", label: "평균 이익", unit: "usdt", better: "high" },
  { key: "avgLoss", label: "평균 손실", unit: "usdt", better: "high" },
  { key: "payoff", label: "이익/손실 비", unit: "x", better: "high" },
  { key: "maxDailyLoss", label: "최대 일손실", unit: "usdt", better: "high" },
  { key: "mdd", label: "MDD", unit: "pct", better: "high" },
  { key: "perDay", label: "거래 수 / 일", unit: "n1", better: null },
  { key: "holdH", label: "평균 보유", unit: "h", better: null },
  { key: "costShare", label: "비용 비중", unit: "pct0", better: "low" },
  { key: "leverage", label: "레버리지 (중앙)", unit: "lev", better: null },
];

export type MetricKey =
  | "net"
  | "twr"
  | "pf"
  | "winRate"
  | "avgWin"
  | "avgLoss"
  | "payoff"
  | "maxDailyLoss"
  | "mdd"
  | "perDay"
  | "holdH"
  | "costShare"
  | "leverage";
export type Metrics = Record<MetricKey, number | null>;
export type Kind = "account" | "replica" | "engine" | "btc";

export interface Column {
  key: string;
  label: string;
  sub: string;
  kind: Kind;
  status: "ok" | "pending" | "empty";
  note: string | null;
  metrics: Metrics;
}

export interface Cell {
  value: number | null;
  tone: "up" | "dn" | "none";
}

export interface CompareView {
  days: number;
  from: number;
  to: number;
  hasAccount: boolean;
  accountAsOf: number | null;
  headline: { text: string; winner: string | null; netLine: string | null };
  columns: Column[];
  rows: { key: MetricKey; label: string; unit: Unit; cells: Cell[] }[];
  gap: { line1: string; line2: string } | null;
  curve: { series: { key: string; label: string; kind: Kind }[]; points: Record<string, number | null>[] };
  calendar: { engines: { key: string; label: string }[]; rows: { day: string; values: Record<string, number | null> }[] };
  dist: { key: string; label: string; bins: { from: number; to: number; account: number; engine: number; edge: "lo" | "hi" | null }[]; lines: { account: { win: number | null; loss: number | null }; engine: { win: number | null; loss: number | null } }; tail: { threshold: number; account: number | null; engine: number | null } | null }[];
  overlap: {
    rows: { at: number; symbol: string; side: string; net: number; holdH: number; cells: Record<string, { state: "entered" | "holding" | "none"; net: number | null; side: string | null }> }[];
    summary: { key: string; label: string; entered: number; overlapped: number; total: number }[];
    total: number;
  };
}

// ── 공통 ────────────────────────────────────────────────────────────────

export function kstDay(ms: number): string {
  return new Date(ms + KST_MS).toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function quantile(values: number[], q: number): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = (s.length - 1) * q;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, s.length - 1);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (k - lo);
}

export function normSymbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/:USDT$/, "").replace(/[^A-Z0-9]/g, "");
  return s.endsWith("USDT") ? s : `${s}USDT`;
}

interface TradeLike {
  net: number;
  gross: number | null;
  costs: number | null;
  entryMs: number;
  exitMs: number;
  leverage: number | null;
}

/** 거래 목록 → 손익 구조. %가 아닌 것들. */
export function tradeStats(trades: TradeLike[], days: number): Omit<Metrics, "twr" | "mdd" | "maxDailyLoss"> {
  const nets = trades.map((t) => t.net);
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n < 0);
  const grossLoss = -losses.reduce((a, b) => a + b, 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null;
  const gross = Math.abs(trades.reduce((a, t) => a + (t.gross ?? t.net), 0));
  const costs = trades.reduce((a, t) => a + Math.abs(t.costs ?? 0), 0);
  return {
    net: trades.length ? nets.reduce((a, b) => a + b, 0) : null,
    pf: grossLoss > 0 ? wins.reduce((a, b) => a + b, 0) / grossLoss : null,
    winRate: nets.length ? (wins.length / nets.length) * 100 : null,
    avgWin,
    avgLoss,
    payoff: avgWin !== null && avgLoss !== null ? avgWin / -avgLoss : null,
    perDay: days > 0 ? trades.length / days : null,
    holdH: trades.length ? trades.reduce((a, t) => a + (t.exitMs - t.entryMs), 0) / trades.length / 3_600_000 : null,
    costShare: gross > 0 && trades.some((t) => t.costs !== null) ? (costs / gross) * 100 : null,
    leverage: median(trades.map((t) => t.leverage).filter((v): v is number => v !== null && v > 0)),
  };
}

function dailyFromTrades(trades: { exitMs: number; net: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of trades) out[kstDay(t.exitMs)] = (out[kstDay(t.exitMs)] ?? 0) + t.net;
  return out;
}

function maxDailyLoss(daily: Record<string, number>): number | null {
  const v = Object.values(daily);
  if (!v.length) return null;
  return Math.min(0, ...v);
}

/** 지수 계열(오름차순 [시각, 값]) → 기간 수익률 · 낙폭 · 1,000 환산 점. */
function seriesStats(points: [number, number][], from: number, to: number): { ret: number | null; mdd: number | null; norm: [number, number][] } {
  const sorted = points.filter(([, v]) => Number.isFinite(v) && v > 0).sort((a, b) => a[0] - b[0]);
  const before = sorted.filter(([t]) => t <= from);
  const inside = sorted.filter(([t]) => t > from && t <= to);
  const start = before.length ? (before[before.length - 1] as [number, number])[1] : inside[0]?.[1];
  if (!start || !inside.length) return { ret: null, mdd: null, norm: [] };
  let peak = start;
  let mdd = 0;
  const norm: [number, number][] = [[from, 1000]];
  for (const [t, v] of inside) {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
    norm.push([t, (v / start) * 1000]);
  }
  const end = (inside[inside.length - 1] as [number, number])[1];
  return { ret: (end / start - 1) * 100, mdd: mdd * 100, norm };
}

const EMPTY: Metrics = {
  net: null,
  twr: null,
  pf: null,
  winRate: null,
  avgWin: null,
  avgLoss: null,
  payoff: null,
  maxDailyLoss: null,
  mdd: null,
  perDay: null,
  holdH: null,
  costShare: null,
  leverage: null,
};

// ── 조사(이/가) ────────────────────────────────────────────────────────

export function subjectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? "이" : "가";
  return "이";
}

// ── 숫자 문장 ───────────────────────────────────────────────────────────

export function fmt(value: number | null, unit: Unit): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  switch (unit) {
    case "usdt":
      return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: abs >= 100 ? 0 : 1 })}`;
    case "pct":
      return `${sign}${abs.toFixed(1)}%`;
    case "pct0":
      return `${abs.toFixed(0)}%`;
    case "x":
      return abs.toFixed(2);
    case "n1":
      return abs.toFixed(1);
    case "h":
      return `${abs.toFixed(1)}h`;
    case "lev":
      return `${abs.toFixed(abs % 1 ? 1 : 0)}x`;
  }
}

const GAP_SENTENCE: Partial<Record<MetricKey, (a: number, b: number, engine: string) => string>> = {
  payoff: (a, b) =>
    a > 1 && b < 1 ? "광혁은 크게 벌고 작게 잃는다. 엔진은 반대다." : a > b ? "광혁은 한 번 벌 때 잃을 때보다 크게 번다." : "엔진이 한 번 벌 때 잃을 때보다 크게 번다.",
  pf: (a, b, e) => (a > b ? "같은 손실에 광혁이 더 많이 번다." : `같은 손실에 ${e}${subjectParticle(e)} 더 많이 번다.`),
  winRate: (a, b, e) => (a > b ? "광혁이 더 자주 이긴다." : `${e}${subjectParticle(e)} 더 자주 이긴다.`),
  costShare: (a, b, e) => (a < b ? `${e}${subjectParticle(e)} 번 것을 비용으로 더 많이 낸다.` : "광혁이 번 것을 비용으로 더 많이 낸다."),
  maxDailyLoss: (a, b, e) => (a > b ? "광혁은 나쁜 날에도 덜 잃는다." : `${e}${subjectParticle(e)} 나쁜 날에 덜 잃는다.`),
  mdd: (a, b, e) => (a > b ? "광혁의 낙폭이 더 얕다." : `${e}의 낙폭이 더 얕다.`),
  twr: (a, b, e) => (a > b ? "같은 기간 광혁의 수익률이 더 높다." : `같은 기간 ${e}의 수익률이 더 높다.`),
  avgWin: (a, b, e) => (a > b ? "광혁의 이긴 거래가 더 크다." : `${e}의 이긴 거래가 더 크다.`),
  avgLoss: (a, b, e) => (a > b ? "광혁의 진 거래가 더 작다." : `${e}의 진 거래가 더 작다.`),
};

function gapScore(key: MetricKey, a: number, b: number): number | null {
  if (key === "pf" || key === "payoff") {
    if (a > 0 && b > 0) return Math.abs(Math.log(a / b));
    return null;
  }
  const ref = Math.max(Math.abs(a), Math.abs(b));
  return ref > 1e-9 ? Math.abs(a - b) / ref : null;
}

// ── 조립 ────────────────────────────────────────────────────────────────

export interface CompareInput {
  account: AccountPayload | null;
  replica: ReplicaPayload | null;
  engines: EngineInput[];
  btc: { at: number; close: number }[];
  days: number;
  now: number;
}

export function buildCompare(input: CompareInput): CompareView {
  const { account, replica, engines, btc, days, now } = input;
  const to = now;
  const from = now - days * DAY_MS;
  const fromDay = kstDay(from);
  const columns: Column[] = [];
  const curves: Record<string, [number, number][]> = {};
  const dailies: Record<string, Record<string, number>> = {};
  const returns: Record<string, number[]> = {};
  const tradesFor: Record<string, { symbol: string; side: string; entryMs: number; exitMs: number; net: number }[]> = {};

  // 광혁 실계좌
  const accTrades = (account?.trades ?? []).filter((t) => t.exitMs > from && t.exitMs <= to);
  if (account) {
    const st = tradeStats(
      accTrades.map((t) => ({ net: t.net, gross: t.gross, costs: t.fees + Math.max(0, -t.funding), entryMs: t.entryMs, exitMs: t.exitMs, leverage: t.leverage })),
      days
    );
    // 날짜 키(KST)의 **마감 시각** — 그날 마감 지수다.
    const twrNorm = seriesStats(
      Object.entries(account.twr).map(([d, v]) => [Date.parse(`${d}T00:00:00Z`) - KST_MS + DAY_MS - 1, v]),
      from,
      to
    );
    const daily = Object.fromEntries(Object.entries(account.daily).filter(([d]) => d > fromDay));
    dailies.account = daily;
    curves.account = twrNorm.norm;
    returns.account = accTrades.map((t) => accountReturn(t)).filter((v): v is number => v !== null);
    tradesFor.account = accTrades;
    columns.push({
      key: "account",
      label: "광혁",
      sub: "실계좌",
      kind: "account",
      status: accTrades.length || Object.keys(daily).length ? "ok" : "empty",
      note: null,
      metrics: { ...EMPTY, ...st, twr: twrNorm.ret, mdd: twrNorm.mdd, maxDailyLoss: maxDailyLoss(daily) },
    });
  } else {
    columns.push({ key: "account", label: "광혁", sub: "실계좌", kind: "account", status: "pending", note: "업로더 대기", metrics: { ...EMPTY } });
  }

  // 광혁 복제(TRADER-02 F)
  if (replica && replica.trades.length) {
    const rt = replica.trades.filter((t) => t.exitMs > from && t.exitMs <= to);
    const st = tradeStats(rt.map((t) => ({ net: t.net, gross: null, costs: null, entryMs: t.entryMs, exitMs: t.exitMs, leverage: null })), days);
    let cum = 0;
    const eq: [number, number][] = [[Math.min(from, replica.startMs), replica.capital]];
    for (const t of [...replica.trades].sort((a, b) => a.exitMs - b.exitMs)) {
      cum += t.net;
      eq.push([t.exitMs, replica.capital + cum]);
    }
    const s = seriesStats(eq, Math.max(from, replica.startMs), to);
    curves.replica = s.norm;
    dailies.replica = dailyFromTrades(rt);
    returns.replica = rt.map((t) => (t.margin ? (t.net / t.margin) * 100 : null)).filter((v): v is number => v !== null);
    tradesFor.replica = replica.trades;
    columns.push({
      key: "replica",
      label: "광혁복제",
      sub: "페이퍼",
      kind: "replica",
      status: "ok",
      note: replica.startMs > from ? `${kstDay(replica.startMs)} 시작` : null,
      metrics: { ...EMPTY, ...st, twr: s.ret, mdd: s.mdd, maxDailyLoss: maxDailyLoss(dailies.replica) },
    });
  } else {
    columns.push({ key: "replica", label: "광혁복제", sub: "페이퍼", kind: "replica", status: "pending", note: "준비 중", metrics: { ...EMPTY } });
  }

  // 엔진 트랙
  for (const e of engines) {
    const et = e.trades.filter((t) => t.exitMs > from && t.exitMs <= to);
    const st = tradeStats(et, days);
    const s = seriesStats(e.capital.map((p) => [p.at, p.capital]), from, to);
    const twr = s.ret ?? (st.net !== null && e.startingCapital > 0 ? (st.net / e.startingCapital) * 100 : null);
    curves[e.key] = s.norm;
    dailies[e.key] = dailyFromTrades(et);
    returns[e.key] = et.map((t) => t.returnPct ?? (t.margin ? (t.net / t.margin) * 100 : null)).filter((v): v is number => v !== null);
    tradesFor[e.key] = e.trades;
    columns.push({
      key: e.key,
      label: e.label,
      sub: "페이퍼",
      kind: "engine",
      status: et.length ? "ok" : "empty",
      note: et.length ? null : "기간 안 거래 없음",
      metrics: { ...EMPTY, ...st, leverage: st.leverage ?? e.leverage, twr, mdd: s.mdd, maxDailyLoss: maxDailyLoss(dailies[e.key] ?? {}) },
    });
  }

  // BTC 보유
  const b = seriesStats(btc.map((p) => [p.at, p.close]), from, to);
  curves.btc = b.norm;
  columns.push({ key: "btc", label: "BTC보유", sub: "", kind: "btc", status: b.ret === null ? "empty" : "ok", note: null, metrics: { ...EMPTY, twr: b.ret, mdd: b.mdd, leverage: 1 } });

  // 표 · 색
  const acc = columns[0] as Column;
  const rows = METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    unit: m.unit,
    cells: columns.map((c): Cell => {
      const value = c.metrics[m.key];
      const base = acc.metrics[m.key];
      let tone: Cell["tone"] = "none";
      if (c.kind !== "account" && c.kind !== "btc" && m.better && value !== null && base !== null && value !== base) {
        const better = m.better === "high" ? value > base : value < base;
        tone = better ? "up" : "dn";
      }
      return { value, tone };
    }),
  }));

  // 맨 위 한 줄
  const rivals = columns.filter((c) => c.kind === "engine" || c.kind === "replica");
  const bestNet = rivals.filter((c) => c.metrics.net !== null).sort((x, y) => (y.metrics.net ?? 0) - (x.metrics.net ?? 0))[0];
  const contenders = [acc, ...rivals].filter((c) => c.metrics.twr !== null);
  const top = contenders.sort((x, y) => (y.metrics.twr ?? 0) - (x.metrics.twr ?? 0))[0];
  const hasAccount = Boolean(account) && acc.status !== "pending";
  let headline: CompareView["headline"];
  if (!hasAccount) {
    headline = { text: "실계좌 데이터가 아직 없다", winner: null, netLine: "맥에서 업로더(me_upload)가 15분마다 올린다 — docs/trader/TRADER-03.md" };
  } else if (!top) {
    headline = { text: "이 기간엔 견줄 숫자가 없다", winner: null, netLine: null };
  } else {
    const who = top.kind === "account" ? "광혁" : top.label;
    headline = {
      text: `${who}${subjectParticle(who)} 이기고 있다`,
      winner: top.key,
      netLine: `같은 기간 순손익  광혁 ${fmt(acc.metrics.net, "usdt")} USDT · 엔진 최고 ${bestNet ? `${fmt(bestNet.metrics.net, "usdt")} USDT (${bestNet.label})` : "—"}`,
    };
  }

  // 가장 큰 차이 — 순손익이 가장 좋은 엔진과 견준다(복제 제외)
  const engineRef = columns.filter((c) => c.kind === "engine" && c.status === "ok").sort((x, y) => (y.metrics.net ?? -Infinity) - (x.metrics.net ?? -Infinity))[0];
  let gap: CompareView["gap"] = null;
  if (hasAccount && engineRef) {
    let best: { key: MetricKey; score: number; a: number; b: number } | null = null;
    for (const m of METRICS) {
      if (!m.better || !GAP_SENTENCE[m.key]) continue;
      const a = acc.metrics[m.key];
      const bv = engineRef.metrics[m.key];
      if (a === null || bv === null) continue;
      const score = gapScore(m.key, a, bv);
      if (score !== null && (!best || score > best.score)) best = { key: m.key, score, a, b: bv };
    }
    if (best) {
      const m = METRICS.find((x) => x.key === best!.key)!;
      gap = {
        line1: `가장 큰 차이: ${m.label} — 광혁 ${fmt(best.a, m.unit)} · ${engineRef.label} ${fmt(best.b, m.unit)}`,
        line2: (GAP_SENTENCE[best.key] as (a: number, b: number, e: string) => string)(best.a, best.b, engineRef.label),
      };
    }
  }

  // 곡선 — 날짜별 한 점(그날 마지막 값). 없는 날은 null(선을 잇지 않는다).
  const series = columns.filter((c) => (curves[c.key]?.length ?? 0) > 0).map((c) => ({ key: c.key, label: c.label, kind: c.kind }));
  const byDay = new Map<string, Record<string, number | null>>();
  for (const s of series) {
    for (const [t, v] of curves[s.key] ?? []) {
      const d = kstDay(t);
      const row = byDay.get(d) ?? { t: Date.parse(`${d}T00:00:00Z`) };
      row[s.key] = Math.round(v * 10) / 10;
      byDay.set(d, row);
    }
  }
  const points = [...byDay.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([, r]) => r);

  // 달력 — 광혁과 엔진들 나란히(날짜 내림차순)
  // 엔진 먼저, 복제는 끝 — 기본으로 견주는 상대는 엔진이다.
  const calEngines = [
    ...columns.filter((c) => c.kind === "engine" && c.status === "ok"),
    ...columns.filter((c) => c.kind === "replica" && c.status === "ok"),
  ].map((c) => ({ key: c.key, label: c.label }));
  const dayset = new Set<string>();
  for (const k of ["account", ...calEngines.map((e) => e.key)]) for (const d of Object.keys(dailies[k] ?? {})) dayset.add(d);
  const calRows = [...dayset]
    .filter((d) => d > fromDay)
    .sort((a, b) => b.localeCompare(a))
    .map((d) => ({ day: d, values: Object.fromEntries(["account", ...calEngines.map((e) => e.key)].map((k) => [k, dailies[k]?.[d] ?? null])) }));

  // 분포 — 광혁 vs 엔진 하나씩(같은 칸)
  const dist = calEngines.map((e) => distribution(returns.account ?? [], returns[e.key] ?? [], e.key, e.label));

  // 같은 순간
  const overlap = overlapView(accTrades, columns.filter((c) => c.kind === "engine" || (c.kind === "replica" && c.status === "ok")), tradesFor, replica);

  return {
    days,
    from,
    to,
    hasAccount,
    accountAsOf: account?.asOf ?? null,
    headline,
    columns,
    rows,
    gap,
    curve: { series, points },
    calendar: { engines: calEngines, rows: calRows },
    dist,
    overlap,
  };
}

/** 증거금 대비 손익률(%). 증거금을 모르면 명목 ÷ 레버리지, 그것도 모르면 뺀다. */
export function accountReturn(t: MeTrade): number | null {
  const margin = t.margin ?? (t.leverage ? t.notional / t.leverage : null);
  return margin && margin > 0 ? (t.net / margin) * 100 : null;
}

const NICE = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];

/** 같은 칸으로 두 분포를 센다. 비율(%)로 — 거래 수가 달라도 모양을 견줄 수 있다. 양 끝 칸은 넘친 것을 모은다. */
export function distribution(a: number[], b: number[], key: string, label: string): CompareView["dist"][number] {
  const all = [...a, ...b];
  const lo0 = quantile(all, 0.02) ?? -10;
  const hi0 = quantile(all, 0.98) ?? 10;
  const span = Math.max(hi0 - lo0, 1);
  const width = NICE.find((w) => span / w <= 18) ?? 100;
  const lo = Math.floor(lo0 / width) * width;
  const hi = Math.ceil(hi0 / width) * width || width;
  const n = Math.max(1, Math.round((hi - lo) / width));
  const bins = Array.from({ length: n }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, account: 0, engine: 0, edge: null as "lo" | "hi" | null }));
  if (bins.length) {
    (bins[0] as { edge: "lo" | "hi" | null }).edge = all.some((v) => v < lo) ? "lo" : null;
    (bins[bins.length - 1] as { edge: "lo" | "hi" | null }).edge = all.some((v) => v >= hi) ? "hi" : null;
  }
  const put = (v: number, field: "account" | "engine") => {
    const bin = bins[Math.min(n - 1, Math.max(0, Math.floor((v - lo) / width)))];
    if (bin) bin[field] += 1;
  };
  a.forEach((v) => put(v, "account"));
  b.forEach((v) => put(v, "engine"));
  for (const bin of bins) {
    bin.account = a.length ? (bin.account / a.length) * 100 : 0;
    bin.engine = b.length ? (bin.engine / b.length) * 100 : 0;
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const p90 = quantile(a, 0.9);
  const threshold = p90 !== null && p90 > 0 ? Math.round(p90) : null;
  return {
    key,
    label,
    bins,
    lines: {
      account: { win: avg(a.filter((x) => x > 0)), loss: avg(a.filter((x) => x < 0)) },
      engine: { win: avg(b.filter((x) => x > 0)), loss: avg(b.filter((x) => x < 0)) },
    },
    // 오른쪽 꼬리 — 광혁 상위 10% 문턱 이상으로 번 거래의 비중.
    tail: threshold === null ? null : {
      threshold,
      account: a.length ? (a.filter((x) => x >= threshold).length / a.length) * 100 : null,
      engine: b.length ? (b.filter((x) => x >= threshold).length / b.length) * 100 : null,
    },
  };
}

function overlapView(
  accTrades: MeTrade[],
  rivals: Column[],
  tradesFor: Record<string, { symbol: string; side: string; entryMs: number; exitMs: number; net: number }[]>,
  replica: ReplicaPayload | null
): CompareView["overlap"] {
  const sorted = [...accTrades].sort((a, b) => b.entryMs - a.entryMs);
  const summary = rivals.map((c) => ({ key: c.key, label: c.label, entered: 0, overlapped: 0, total: sorted.length }));
  const rows = sorted.map((t) => {
    const sym = normSymbol(t.symbol);
    const cells: CompareView["overlap"]["rows"][number]["cells"] = {};
    rivals.forEach((c, i) => {
      const list = tradesFor[c.key] ?? [];
      const same = list.filter((x) => normSymbol(x.symbol) === sym);
      const entered = same
        .filter((x) => x.side === t.side && Math.abs(x.entryMs - t.entryMs) <= MATCH_MS)
        .sort((x, y) => Math.abs(x.entryMs - t.entryMs) - Math.abs(y.entryMs - t.entryMs))[0];
      const holding = same.find((x) => x.entryMs <= t.entryMs && t.entryMs < x.exitMs);
      const openNow = c.kind === "replica" ? replica?.open.find((o) => normSymbol(o.symbol) === sym && o.entryMs <= t.entryMs) : undefined;
      const s = summary[i] as (typeof summary)[number];
      if (entered) {
        cells[c.key] = { state: "entered", net: entered.net, side: entered.side };
        s.entered += 1;
        s.overlapped += 1;
      } else if (holding || openNow) {
        cells[c.key] = { state: "holding", net: holding?.net ?? null, side: holding?.side ?? openNow?.side ?? null };
        s.overlapped += 1;
      } else {
        cells[c.key] = { state: "none", net: null, side: null };
      }
    });
    return { at: t.entryMs, symbol: t.symbol, side: t.side, net: t.net, holdH: (t.exitMs - t.entryMs) / 3_600_000, cells };
  });
  return { rows: rows.slice(0, 80), summary, total: sorted.length };
}
