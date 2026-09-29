/**
 * 자체 연구 루프 (ENG-02) — 순수 함수. **스스로를 속이는 기계를 만들지 않는 규칙**이 이 파일에 있다.
 *
 * ```
 * 관측 ─▶ 가설 ─▶ (재판정으로 거르기) ─▶ 그림자 ─▶ 판정 ─▶ 연구 노트 ─▶ 🧑 승인 ─▶ 새 정책 버전
 * ```
 *
 * ## 규칙 셋 (0-2)
 *
 * 1. **한 번에 하나만 바꾼다** — 실험 하나 = 파라미터 하나(허용 목록 {@link PARAMS}). 둘이면 등록을 거절한다
 * 2. **판정 기준은 시작 전에 고정한다** — 시작할 때 기준을 적고 지문({@link criteriaFingerprint})을 남긴다.
 *    판정 때 지문이 다르면 그 실험은 **무효**다
 * 3. **적용은 사람이 승인한다** — 판정이 통과여도 상태는 `awaiting` 에서 멈춘다. 본 트랙을 바꾸는 길은 승인뿐이다
 *
 * ## 다중 비교는 누적으로 (D-2)
 *
 * 우연 확률의 시도 수 = **지금까지 시작한 그림자 전부**(번호는 되돌리지 않는다 · 실패한 실험도 지우지 않는다).
 * 시도할수록 통과가 어려워지는 게 맞다.
 *
 *     단일 p  = 본 트랙과 그림자의 **일별 손익 차이**에 대한 짝지은 t 검정(단측) — 같은 신호를 받아 서로 상관돼 있다
 *     보정 P  = 1 − (1 − p)^N   (Šidák · N = 누적 시도) — 전략 탭 우연 확률과 같은 식(`@fomo/lab`)
 *
 * ## LLM 은 숫자를 고르지 않는다 (B-3)
 *
 * 값은 **데이터 규칙**으로 정한다({@link hypothesesFrom}). 문장도 여기서는 틀로 쓴다.
 */
import { createHash } from "node:crypto";

import { normalCdf } from "@fomo/lab";

export const MAX_RUNNING = 3;
export const CHANCE_LIMIT = 0.2;

/** 바꿀 수 있는 것 — FCE `PaperPolicy` 칸 이름 그대로. 여기 없는 것은 실험할 수 없다. */
export const PARAMS = {
  max_entry_cost_r: { kind: "number", label: "진입 비용 상한(비용R)", track: "crypto" },
  risk_mode: { kind: "mode", label: "손절 거리 방식", track: "crypto", values: ["atr_capped", "structural", "nearest_structure"] },
  risk_budget_usdt: { kind: "number", label: "1R 금액(자본 규모)", track: "crypto" },
} as const;
export type ParamKey = keyof typeof PARAMS;

/** 자본 설정은 파라미터가 아니다 — 광혁 결정. 판정 결과만 보고하고 승인으로 반영하지 않는다(G). */
export const REPORT_ONLY: ReadonlySet<ParamKey> = new Set(["risk_budget_usdt"]);

export interface Criteria {
  minTrades: number;
  minDays: number;
  /** 판단 불가 때 **한 번만** 이만큼 늘린다 — 기준은 그대로. */
  extensionDays: number;
  chanceLimit: number;
  /** 통과 = 셋 다. */
  rules: ["return_over_mdd_above_main", "family_chance_below_limit", "net_after_cost_above_main"];
}

export const DEFAULT_CRITERIA: Criteria = {
  minTrades: 30,
  minDays: 14,
  extensionDays: 14,
  chanceLimit: CHANCE_LIMIT,
  rules: ["return_over_mdd_above_main", "family_chance_below_limit", "net_after_cost_above_main"],
};

/** 잠금 지문 — 기준 · 바꿀 것 · 시작 시각을 묶는다. 하나라도 바뀌면 달라진다. */
export function criteriaFingerprint(e: { param: string; baseline: unknown; value: unknown; startedAt: string; criteria: Criteria }): string {
  const canonical = JSON.stringify([e.param, e.baseline, e.value, e.startedAt, e.criteria.minTrades, e.criteria.minDays, e.criteria.extensionDays, e.criteria.chanceLimit, e.criteria.rules]);
  return createHash("sha256").update(canonical).digest("hex");
}

// ── 관측 · 가설 (B) ────────────────────────────────────────────────────────

export interface Observations {
  /** 복기 — 비용 합 ÷ 비용 전 손익 절댓값 합. */
  costShare: { pct: number; trades: number } | null;
  /** 복기 청산 품질 — 손절 뒤 7일 안에 되돌아온 비율. */
  stopRebound: { pct: number; of: number } | null;
  /** 최근 진입의 비용R(`target_plan.cost_r`) — 오름차순이 아니어도 된다. */
  entryCostR: number[];
  /** 지금 정책 값(FCE `crypto-vN.json`). */
  policy: { version: string; max_entry_cost_r: number | null; risk_mode: string | null; risk_budget_usdt: number | null };
  /** 크립토 트랙 자본(시작) — 자본 가설의 배율. */
  cryptoCapital: number | null;
}

export interface Hypothesis {
  key: string;
  param: ParamKey;
  baseline: number | string;
  value: number | string;
  observation: string;
  hypothesis: string;
  question: string;
  reportOnly: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/**
 * 관측 → 가설. **값은 데이터 규칙이다** — 사람도 LLM 도 고르지 않는다.
 *
 * | # | 관측 | 바꿀 것 | 값을 정하는 규칙 |
 * |---|---|---|---|
 * | 1 | 비용이 비용 전 손익의 30% 넘게 먹는다 | `max_entry_cost_r` | 최근 진입 비용R 의 **중앙값**(지금 상한보다 낮을 때만) — 비싼 절반을 거른다 |
 * | 2 | 손절 뒤 되돌아온 비율 ≥ 40% | `risk_mode` | `atr_capped` → `structural` — 1 ATR 로 좁히지 않고 구조 거리 그대로(모드 전환 · 숫자 없음) |
 * | 3 | 비용 비중이 크다 · 자본 500 | `risk_budget_usdt` | × (2,000 ÷ 크립토 시작 자본) — 지시서 G-3 의 자본 2,000 · **보고만** |
 */
export function hypothesesFrom(o: Observations): Hypothesis[] {
  const out: Hypothesis[] = [];
  const cost = o.costShare;
  const med = median(o.entryCostR.filter((v) => Number.isFinite(v) && v > 0));
  if (cost && cost.pct >= 30 && med !== null && o.policy.max_entry_cost_r !== null && med < o.policy.max_entry_cost_r - 1e-9) {
    const value = Math.round(med * 1000) / 1000;
    out.push({
      key: `max_entry_cost_r:${value}`,
      param: "max_entry_cost_r",
      baseline: o.policy.max_entry_cost_r,
      value,
      observation: `비용이 비용 전 손익 규모의 ${Math.round(cost.pct)}%다 (복기 · ${cost.trades}건)`,
      hypothesis: `진입 비용 상한을 비용R ${o.policy.max_entry_cost_r} → ${value}(최근 진입 중앙값)로 죄면 비용 후 손익이 나아진다`,
      question: "진입 비용 문턱을 죄면 비용 후 손익이 나아지나",
      reportOnly: false,
    });
  }
  const rb = o.stopRebound;
  if (rb && rb.of >= 10 && rb.pct >= 40 && o.policy.risk_mode === "atr_capped") {
    out.push({
      key: "risk_mode:structural",
      param: "risk_mode",
      baseline: "atr_capped",
      value: "structural",
      observation: `손절 뒤 7일 안에 되돌아온 비율 ${Math.round(rb.pct)}% (복기 · 손절 ${rb.of}건)`,
      hypothesis: "손절을 1 ATR 로 좁히지 않고 구조 거리 그대로 두면 손절 뒤 반등 손실이 준다",
      question: "손절을 넓히면 손절 뒤 반등 손실이 주나",
      reportOnly: false,
    });
  }
  if (cost && cost.pct >= 30 && o.policy.risk_budget_usdt !== null && o.cryptoCapital && o.cryptoCapital > 0 && o.cryptoCapital < 2000) {
    const value = Math.round(o.policy.risk_budget_usdt * (2000 / o.cryptoCapital) * 100) / 100;
    out.push({
      key: `risk_budget_usdt:${value}`,
      param: "risk_budget_usdt",
      baseline: o.policy.risk_budget_usdt,
      value,
      observation: `크립토 자본 ${o.cryptoCapital} USDT · 비용이 손익 규모의 ${Math.round(cost.pct)}%`,
      hypothesis: `자본을 2,000 으로 늘리면(1R ${o.policy.risk_budget_usdt} → ${value}) 수수료 비중이 준다`,
      question: "크립토 자본을 늘리면 수수료 비중이 주나",
      reportOnly: true,
    });
  }
  return out;
}

// ── 등록 (C-2 · D-1) ───────────────────────────────────────────────────────

export type ExperimentStatus =
  | "filtering" // 재판정으로 거르는 중
  | "discarded" // 재판정에서 명백히 나빴다 — 그림자로 안 올림(시도 수에 안 센다)
  | "running" // 그림자 운용 중 — 시도 수에 센다
  | "extended" // 판단 불가 → 한 번 연장
  | "awaiting" // 통과 → 승인 대기
  | "failed" // 실패 — 없음으로 닫힘
  | "inconclusive" // 연장해도 판단 불가
  | "invalid" // 기준 지문이 달라졌다
  | "approved" // 승인 → 새 정책 버전
  | "rejected" // 기각
  | "reported"; // 자본 설정 — 결과만 보고

export const RUNNING_STATES: ReadonlySet<ExperimentStatus> = new Set(["filtering", "running", "extended"]);
export const SHADOW_STATES: ReadonlySet<ExperimentStatus> = new Set(["running", "extended"]);

export interface ExperimentRow {
  number: number;
  key: string;
  param: string;
  baseline: unknown;
  value: unknown;
  status: ExperimentStatus;
  startedAt: string | null;
}

/** 등록해도 되나 — 안 되면 사유. **한 파라미터** · 허용 목록 · 값이 다르다 · 동시 3 · 같은 시도 두 번 금지. */
export function registrationProblem(h: Pick<Hypothesis, "param" | "baseline" | "value" | "key">, existing: ExperimentRow[]): string | null {
  const spec = (PARAMS as Record<string, (typeof PARAMS)[ParamKey]>)[h.param];
  if (!spec) return `${h.param} 은 실험할 수 있는 파라미터가 아니다`;
  if (spec.kind === "number" && typeof h.value !== "number") return "숫자 파라미터에 숫자가 아닌 값";
  if (spec.kind === "mode" && !(spec.values as readonly string[]).includes(String(h.value))) return "허용되지 않은 모드";
  if (h.value === h.baseline) return "지금 값과 같다 — 바꾸는 게 없다";
  const live = existing.filter((e) => RUNNING_STATES.has(e.status));
  if (live.length >= MAX_RUNNING) return `동시 실험이 이미 ${MAX_RUNNING}개다`;
  if (live.some((e) => e.param === h.param)) return `${h.param} 을 바꾸는 실험이 이미 돌고 있다`;
  if (existing.some((e) => e.key === h.key)) return "같은 시도를 이미 했다 — 결과를 지우고 다시 하지 않는다";
  return null;
}

/** 누적 시도 수 — 그림자로 **시작한** 실험 전부(걸러져 안 올라간 것은 빼고). 줄어들 수 없다. */
export function cumulativeTries(rows: ExperimentRow[]): number {
  return rows.filter((r) => r.startedAt !== null).length;
}

// ── 판정 (D) ──────────────────────────────────────────────────────────────

export interface TradeRow {
  exitAt: string;
  netPnlUsdt: number;
  costsUsdt: number;
}

export interface Side {
  n: number;
  netUsdt: number;
  costsUsdt: number;
  returnPct: number;
  mddPct: number;
  returnOverMdd: number | null;
}

export interface Judgment {
  state: "waiting" | "passed" | "failed" | "extend" | "inconclusive" | "invalid";
  days: number;
  trades: number;
  main: Side;
  shadow: Side;
  singleP: number | null;
  familyP: number | null;
  tries: number;
  checks: { returnOverMdd: boolean; chance: boolean; netAfterCost: boolean } | null;
  reason: string;
}

const DAY = 86_400_000;
const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);

function sideOf(trades: TradeRow[], capital: number): Side {
  const rows = [...trades].sort((a, b) => Date.parse(a.exitAt) - Date.parse(b.exitAt));
  let equity = capital;
  let peak = capital;
  let mdd = 0;
  for (const t of rows) {
    equity += t.netPnlUsdt;
    peak = Math.max(peak, equity);
    if (peak > 0) mdd = Math.min(mdd, ((equity - peak) / peak) * 100);
  }
  const net = rows.reduce((s, t) => s + t.netPnlUsdt, 0);
  const returnPct = capital > 0 ? (net / capital) * 100 : 0;
  return {
    n: rows.length,
    netUsdt: net,
    costsUsdt: rows.reduce((s, t) => s + t.costsUsdt, 0),
    returnPct,
    mddPct: mdd,
    // 낙폭이 0 이면 비율이 정의되지 않는다 — 수익이면 무한대로 두지 않고 null(비교 불가)로.
    returnOverMdd: mdd < 0 ? returnPct / Math.abs(mdd) : null,
  };
}

/** 짝지은 일별 차이 t 검정(단측: 그림자가 낫다). 날이 둘 미만이거나 분산 0 이면 null. */
export function pairedDailyP(main: TradeRow[], shadow: TradeRow[], from: string, to: string): number | null {
  const days: string[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) days.push(kstDay(new Date(t).toISOString()));
  const sum = (rows: TradeRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(kstDay(r.exitAt), (m.get(kstDay(r.exitAt)) ?? 0) + r.netPnlUsdt);
    return m;
  };
  const a = sum(main);
  const b = sum(shadow);
  const diffs = [...new Set(days)].map((d) => (b.get(d) ?? 0) - (a.get(d) ?? 0));
  if (diffs.length < 2) return null;
  const mean = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / (diffs.length - 1));
  if (!(sd > 0)) return null;
  const t = mean / (sd / Math.sqrt(diffs.length));
  return 1 - normalCdf(t);
}

/**
 * 판정. 기준은 **잠긴 것**만 쓴다 — `fingerprint` 가 지금 계산과 다르면 무효.
 *
 * - 판정 시점(거래 ≥ 30 AND 일 ≥ 14) 전: `waiting`
 * - 14일이 지났는데 거래가 모자라면: 연장 안 했으면 `extend`(한 번) · 했으면 `inconclusive`
 * - 판정: 셋 다면 `passed` · 아니면 `failed`
 */
export function judge(input: {
  criteria: Criteria;
  fingerprint: string;
  expectedFingerprint: string;
  startedAt: string;
  now: Date;
  extended: boolean;
  capital: number;
  main: TradeRow[];
  shadow: TradeRow[];
  tries: number;
}): Judgment {
  const c = input.criteria;
  const days = Math.floor((input.now.getTime() - Date.parse(input.startedAt)) / DAY);
  const inWindow = (rows: TradeRow[]) => rows.filter((r) => Date.parse(r.exitAt) >= Date.parse(input.startedAt) && Date.parse(r.exitAt) <= input.now.getTime());
  const main = inWindow(input.main);
  const shadow = inWindow(input.shadow);
  const base = { days, trades: shadow.length, main: sideOf(main, input.capital), shadow: sideOf(shadow, input.capital), tries: input.tries };
  if (input.fingerprint !== input.expectedFingerprint) {
    return { ...base, state: "invalid", singleP: null, familyP: null, checks: null, reason: "판정 기준이 시작 때와 다르다 — 이 실험은 무효" };
  }
  const deadline = c.minDays + (input.extended ? c.extensionDays : 0);
  const enough = shadow.length >= c.minTrades;
  if (!enough || days < c.minDays) {
    if (days >= deadline && !enough) {
      return input.extended
        ? { ...base, state: "inconclusive", singleP: null, familyP: null, checks: null, reason: `연장까지 ${deadline}일 — 거래 ${shadow.length}/${c.minTrades}` }
        : { ...base, state: "extend", singleP: null, familyP: null, checks: null, reason: `${c.minDays}일 — 거래 ${shadow.length}/${c.minTrades} · 기준 그대로 ${c.extensionDays}일 한 번 연장` };
    }
    return { ...base, state: "waiting", singleP: null, familyP: null, checks: null, reason: `거래 ${shadow.length}/${c.minTrades} · ${days}/${c.minDays}일` };
  }
  const p = pairedDailyP(main, shadow, input.startedAt, input.now.toISOString());
  const familyP = p === null ? null : 1 - (1 - p) ** Math.max(1, input.tries);
  // 낙폭이 0 이면 비율이 없다 — 비교할 때만 수익 부호로 ±무한대로 둔다(낙폭 없이 벌었으면 누구보다 낫다).
  const rom = (x: Side) => (x.mddPct < 0 ? x.returnPct / Math.abs(x.mddPct) : x.returnPct > 0 ? Infinity : x.returnPct < 0 ? -Infinity : 0);
  const checks = {
    returnOverMdd: rom(base.shadow) > rom(base.main),
    chance: familyP !== null && familyP < c.chanceLimit,
    netAfterCost: base.shadow.netUsdt > base.main.netUsdt,
  };
  const passed = checks.returnOverMdd && checks.chance && checks.netAfterCost;
  return {
    ...base,
    state: passed ? "passed" : "failed",
    singleP: p,
    familyP,
    checks,
    reason: passed ? "셋 다 통과" : `못 넘은 것: ${[!checks.returnOverMdd && "수익÷낙폭", !checks.chance && "우연 확률", !checks.netAfterCost && "비용 후 손익"].filter(Boolean).join(" · ")}`,
  };
}

// ── 연구 노트 (E) ─────────────────────────────────────────────────────────

const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;
const ratio = (v: number | null) => (v === null ? "—" : v.toFixed(2));

/** 판정이 나면 연구 탭에 올라가는 노트 한 장(UI-08 규칙 — 질문형 제목 · 출처 있는 알아낸 것 · 결정). */
export function noteFrom(e: {
  number: number;
  question: string;
  observation: string;
  hypothesis: string;
  param: string;
  baseline: unknown;
  value: unknown;
  startedAt: string;
  reportOnly: boolean;
}, j: Judgment) {
  const tag = `그림자 #${String(e.number).padStart(2, "0")}`;
  const passed = j.state === "passed";
  const status = passed ? (e.reportOnly ? "closed" : "open") : "closed";
  const verdict = status === "closed" ? (passed ? "yes" : j.state === "failed" ? "no" : "inconclusive") : null;
  const line = `${tag} · ${j.days}일 · 거래 ${j.trades}`;
  return {
    title: e.question,
    status,
    verdict,
    summary: passed ? (e.reportOnly ? "통과 — 자본 결정은 광혁" : "통과 — 승인 대기") : j.state === "failed" ? "없음 — 기준을 못 넘었다" : "판단 불가 — 연장해도 표본 부족",
    why: e.observation,
    hypothesis: e.hypothesis,
    method: `${line} · 바꾼 것 ${e.param} ${String(e.baseline)} → ${String(e.value)} · 나머지 그대로 · 기준은 시작 때 잠금`,
    findings: [
      { mark: "confirmed", text: `본 트랙 수익÷낙폭 ${ratio(j.main.returnOverMdd)} · 비용 후 ${money(j.main.netUsdt)} · 거래 ${j.main.n}`, note: null, source: `${tag} 같은 기간` },
      { mark: "confirmed", text: `그림자 수익÷낙폭 ${ratio(j.shadow.returnOverMdd)} · 비용 후 ${money(j.shadow.netUsdt)} · 거래 ${j.shadow.n}`, note: null, source: tag },
      {
        mark: passed ? "confirmed" : "rejected",
        text: `우연 확률 ${j.familyP === null ? "—" : `${Math.round(j.familyP * 100)}%`} (누적 시도 ${j.tries})`,
        note: j.reason,
        source: "짝지은 일별 차이 t 검정 · Šidák 누적",
      },
    ],
    decision: passed
      ? e.reportOnly
        ? `**자본은 파라미터가 아니다.** 결과만 보고한다 — 반영은 광혁 결정.`
        : `**승인 대기.** 텔레그램 /approve ${e.number} 로 새 정책 버전, /reject ${e.number} 사유 로 닫는다.`
      : j.state === "failed"
        ? `**없음.** ${j.reason} — 지우지 않고 닫는다.`
        : `**판단 불가.** ${j.reason}.`,
    evidence: [
      { label: "그림자", value: line, source: tag },
      { label: "바꾼 것", value: `${e.param} ${String(e.baseline)} → ${String(e.value)}`, source: "사전 등록" },
      { label: "우연 확률", value: `${j.familyP === null ? "—" : `${Math.round(j.familyP * 100)}%`} · 시도 ${j.tries}`, source: "Šidák" },
    ],
  };
}
