/**
 * WO-G1A 「오늘의 조용한 픽」 선별 엔진 — 피벗 1호.
 *
 * "뉴스 나오기 전에 돈이 먼저 들어간 종목만." 30장 종합 덱과 병행(전환은 G1-B).
 * 자격은 전부 결정론 규칙(순서대로): ① 조용한 돈 신호 1개+ ② 아직 조용함 ③ 품질 게이트.
 * 신호 강도순 상위 최대 10장. 미달이면 그 수만큼(억지 충원 금지 — "오늘은 3곳뿐이에요"가 정직).
 * 자산군 쿼터 없음. 코인은 이번 범위 제외(온체인/거래소 순유출 소스 미확보 — 가짜 수치 금지).
 * 새 데이터 소스 0: insider-source(US Form4) · supply-demand-store(KR 외인·기관) 재사용.
 *
 * LLM 금지(위원회 검수 제외): 신호·훅·무효선·와이코프·점수 전부 결정론. 위원회 소견은 등급 기반 결정론 조립.
 */

import {
  STOCK_VOCAB,
  investorNetStreak,
  buildQuietPickHook,
  type StockDef,
  type InvestorFlow,
  type CardVerdict,
  type WyckoffAnalysis,
  type CompanyScoreResult,
  type SignalTypeCode,
  type QuietPickSignalKind,
} from "@fomo/core";
import { kstDate } from "./fomo";
import { parsePriceText } from "./quote-prices";
import { readSupplyDemandHistoryByTickers } from "./supply-demand-store";
import { computeStockAttentionSignals, type StockAttentionSignal } from "./stock-signal-coverage";
import { fetchKrMarketRows } from "./discovery-supply";
import { fetchInsiderClusterCandidates, type InsiderClusterCandidate } from "./insider-source";
import { assembleStockFront, fetchMarketCapRankMap, type StockFrontData } from "./stock-front";
import { assetForStock, ledgerKey, scoreBand, type LedgerAppendInput } from "./judgment-ledger";

/** discovery-supply 가 이름을 export 하지 않으므로 반환 타입에서 파생(구조적). */
export type KrMarketRow = Awaited<ReturnType<typeof fetchKrMarketRows>>[number];

// ── 자격 임계(전부 결정론 상수) ──────────────────────────────────────────
/** 내부자 클러스터: 서로 다른 내부자 2인+ 매수. */
const INSIDER_MIN_INSIDERS = 2;
/** 내부자 클러스터 총액 하한(WO $200k — openinsider 기본 $100k 보다 조임). */
const INSIDER_MIN_VALUE_USD = 200_000;
/** 최근 매수만: 거래일 기준 N일 이내(10거래일 ≈ 14달력일 근사). */
const INSIDER_MAX_TRADE_AGE_DAYS = 14;
/** 기관·외인 순매수 연속 일수 하한. */
const STREAK_MIN_DAYS = 3;
/** 아직 조용함: 당일 등락 절대값 상한(급등 후 편입 금지 — 늦었나?는 C-1 영역). */
const MAX_ABS_CHANGE_PCT = 15;
/** 화제성 하위: mentionScore(0~100 시장 상대) 상한. */
const MAX_MENTION_SCORE = 70;
/** 거래대금 상위 랭크(이 순위 이내면 이미 화제 — 픽 제외). */
const TRADING_VALUE_TOP_RANK = 20;
/** 신호 시작 후 누적 상승 상한(이미 재평가된 건 발굴 아님). */
const MAX_CUMULATIVE_SINCE_SIGNAL_PCT = 30;
/** 품질: verdict/phase 산출에 충분한 캔들(무효선=30, 와이코프 phase=60). */
const MIN_CANDLES = 60;
/** 유동성 하한(KR 일 거래대금 10억원). */
const KR_MIN_TRADING_VALUE = 1_000_000_000;
/** 하루 최대 픽 수(미달이면 그 수만큼 — 억지 충원 금지). */
export const QUIET_PICK_MAX = 10;

// ── 스키마(카드·뎁스가 소비할 단일 페이로드) ──────────────────────────────
export interface QuietPickSubject {
  canonical: string;
  symbol?: string;
  naverCode?: string;
  market: string;
  country: "KR" | "US";
}

export interface QuietPickSignal {
  kind: QuietPickSignalKind;
  /** 판단 원장/성적표 신호별 집계용 taxonomy 코드. */
  code: SignalTypeCode;
  /** "내부자 3명" / "기관" / "외국인" / "외국인·기관" — 실주체. */
  actors: string;
  /** "$4.6M" / "27만주" — 실공시 수치만. */
  scale: string;
  /** 지속·윈도우 일수. */
  days: number;
  /** 신호 시작 시점 가격(박제). */
  priceAtSignal: number;
  /** 신호 시작일(YYYY-MM-DD). */
  startedAt: string;
  /** 정렬용 신호 강도(다중 > 내부자 > 단일 streak). */
  strength: number;
}

export interface QuietPickInvalidation {
  level: number | null;
  text: string;
}

export interface QuietPickConviction {
  /** 왜 이 회사 — 기존 종합점수 평가 재가공(G1-B가 "어떤 회사예요" 풀 렌더). */
  whyCompany: string;
  /** 왜 지금 — 와이코프 구간·눌림·핵심 레벨. */
  whyNow: { phase?: string; summary?: string; keyLevels?: { low?: number; high?: number } };
  /** 위원회 소견(등급 기반 결정론 — 사실 게이트 자동 통과). */
  committee: {
    tradingView?: string;
    fundamentalView?: string;
    timingGrade: "A" | "B" | "C";
    valuationGrade: "A" | "B" | "C";
    verdict1line: string;
  };
}

export interface QuietPick {
  subject: QuietPickSubject;
  price: { current: number; currentText?: string; changePct?: number; sparkline: number[] };
  signal: QuietPickSignal;
  hook: string;
  invalidation: QuietPickInvalidation;
  conviction: QuietPickConviction;
  /** 종합점수(내부화 — 화면 노출 아님, 픽 근거·성적표 밴드용). */
  companyScore: number | null;
  qualifiedAt: string;
}

/** 자격 통과·탈락 근거 로그(억지 충원 없음 검증용). */
export interface QuietPickQualification {
  krUniverse: number;
  krWithSignal: number;
  usInsiderRaw: number;
  usWithSignal: number;
  afterQuiet: number;
  afterQuality: number;
  published: number;
  drops: Record<string, number>;
}

export interface QuietPickResponse {
  asOf: string;
  date: string;
  picks: QuietPick[];
  qualification: QuietPickQualification;
  source: string;
}

// ── 주입 가능한 의존성(단위 테스트용 — 기본은 실 소스) ──────────────────────
export interface QuietPickDeps {
  vocab: readonly StockDef[];
  fetchKrMarketRows: typeof fetchKrMarketRows;
  readSupplyDemandHistoryByTickers: typeof readSupplyDemandHistoryByTickers;
  computeStockAttentionSignals: typeof computeStockAttentionSignals;
  fetchInsiderClusterCandidates: typeof fetchInsiderClusterCandidates;
  fetchMarketCapRankMap: typeof fetchMarketCapRankMap;
  assembleStockFront: typeof assembleStockFront;
}

const defaultDeps: QuietPickDeps = {
  vocab: STOCK_VOCAB,
  fetchKrMarketRows,
  readSupplyDemandHistoryByTickers,
  computeStockAttentionSignals,
  fetchInsiderClusterCandidates,
  fetchMarketCapRankMap,
  assembleStockFront,
};

// ── 수치 포매터(실측만) ────────────────────────────────────────────────
function formatShares(shares: number): string {
  const abs = Math.abs(Math.round(shares));
  if (abs >= 10_000) return `${Math.round(abs / 10_000).toLocaleString("en-US")}만주`;
  return `${abs.toLocaleString("en-US")}주`;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function daysBetween(fromDate: string, today: string): number {
  const from = new Date(`${fromDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  const to = new Date(`${today}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** 최신순 flows 에서 index 0부터 같은 부호로 이어지는 순매수 일수·합계·시작일. */
function positiveStreak(nets: readonly { net: number; date: string }[]): { days: number; sum: number; startedAt: string } {
  let days = 0;
  let sum = 0;
  let startedAt = "";
  for (const { net, date } of nets) {
    if (net <= 0) break;
    days += 1;
    sum += net;
    startedAt = date;
  }
  return { days, sum, startedAt };
}

/** KR 캔들(YYYYMMDD)에서 신호 시작일(YYYY-MM-DD) 시점의 종가 — 없으면 그 이전 최근 종가. */
function krCloseAtOrBefore(front: StockFrontData, startedAt: string): number | null {
  const target = startedAt.replace(/-/g, "");
  const candles = front.candles ?? [];
  let picked: number | null = null;
  for (const candle of candles) {
    const date = candle.date ?? "";
    if (date && date <= target) picked = candle.close;
    else if (date > target) break;
  }
  return picked ?? candles[0]?.close ?? null;
}

// ── 위원회 소견(등급 기반 결정론 — LLM 없음, 사실 게이트 자동 통과) ──────────
function timingGradeOf(verdict?: CardVerdict): "A" | "B" | "C" {
  if (!verdict) return "C";
  if (verdict.stance === "enter") return verdict.confidence === "high" ? "A" : "B";
  if (verdict.stance === "watch") return verdict.confidence === "low" ? "C" : "B";
  return "C";
}

function valuationGradeOf(score: number | null): "A" | "B" | "C" {
  if (typeof score !== "number") return "C";
  if (score >= 70) return "A";
  if (score >= 50) return "B";
  return "C";
}

const TIMING_CLAUSE: Record<"A" | "B" | "C", string> = {
  A: "자리 좋아요",
  B: "자리 보통이에요",
  C: "자리는 지켜봐야 해요",
};
const VALUATION_CLAUSE: Record<"A" | "B" | "C", string> = {
  A: "밸류 매력 있어요",
  B: "밸류 무난해요",
  C: "밸류는 아쉬워요",
};

function committeeVerdictLine(timing: "A" | "B" | "C", valuation: "A" | "B" | "C"): string {
  return `${TIMING_CLAUSE[timing]}, ${VALUATION_CLAUSE[valuation]}`;
}

// ── 후보(신호 검출 결과) ────────────────────────────────────────────────
interface SignalCandidate {
  subject: QuietPickSubject;
  kind: QuietPickSignalKind;
  code: SignalTypeCode;
  actors: string;
  scale: string;
  days: number;
  startedAt: string;
  /** US 는 공시가 신호가격, KR 은 캔들에서 확정. */
  priceAtSignal?: number;
  baseStrength: number;
  attentionKey: string;
}

/** ① 조용한 돈 신호 — KR 기관·외인·다중 클러스터. */
function detectKrSignals(
  vocab: readonly StockDef[],
  histories: Record<string, InvestorFlow[]>
): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  for (const def of vocab) {
    if (!def.naverCode || def.marquee) continue; // 초대형 대장주는 "조용한 발굴" 대상 아님
    const flows = histories[def.naverCode];
    if (!flows || flows.length === 0) continue;
    const streak = investorNetStreak(flows);
    const foreignQualified = streak.foreign >= STREAK_MIN_DAYS;
    const instQualified = streak.institution >= STREAK_MIN_DAYS;
    if (!foreignQualified && !instQualified) continue;

    const foreignSeries = flows.map((f) => ({ net: f.foreignNet, date: f.date }));
    const instSeries = flows.map((f) => ({ net: f.institutionNet, date: f.date }));
    const foreign = positiveStreak(foreignSeries);
    const inst = positiveStreak(instSeries);
    const subject: QuietPickSubject = {
      canonical: def.canonical,
      symbol: def.naverCode,
      naverCode: def.naverCode,
      market: def.market,
      country: "KR",
    };

    if (foreignQualified && instQualified) {
      // ★다중 주체 클러스터 — 최상급(우선순위 1).
      out.push({
        subject,
        kind: "multi_cluster",
        code: "cluster_multi",
        actors: "외국인·기관",
        scale: `${formatShares(foreign.sum + inst.sum)} 매집`,
        days: Math.min(foreign.days, inst.days),
        startedAt: foreign.startedAt < inst.startedAt ? inst.startedAt : foreign.startedAt,
        baseStrength: 300 + Math.min(foreign.days, inst.days) * 5,
        attentionKey: def.canonical,
      });
    } else if (foreignQualified) {
      out.push({
        subject,
        kind: "foreign_streak",
        code: "foreign_streak",
        actors: "외국인",
        scale: formatShares(foreign.sum),
        days: foreign.days,
        startedAt: foreign.startedAt,
        baseStrength: 100 + foreign.days * 10,
        attentionKey: def.canonical,
      });
    } else {
      out.push({
        subject,
        kind: "institution_streak",
        code: "institution_streak",
        actors: "기관",
        scale: formatShares(inst.sum),
        days: inst.days,
        startedAt: inst.startedAt,
        baseStrength: 100 + inst.days * 10,
        attentionKey: def.canonical,
      });
    }
  }
  return out;
}

/** ① 조용한 돈 신호 — US 내부자 클러스터(Form4). */
function detectUsInsiderSignals(candidates: readonly InsiderClusterCandidate[], today: string): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  for (const c of candidates) {
    if (c.insiderCount < INSIDER_MIN_INSIDERS) continue;
    if (c.valueUsd < INSIDER_MIN_VALUE_USD) continue;
    if (daysBetween(c.tradeDate, today) > INSIDER_MAX_TRADE_AGE_DAYS) continue;
    const priceAtSignal = c.buyPrice ?? c.quote?.price;
    if (!priceAtSignal || priceAtSignal <= 0) continue;
    out.push({
      subject: {
        canonical: c.companyName || c.symbol,
        symbol: c.symbol,
        market: "US",
        country: "US",
      },
      kind: "insider_cluster",
      code: "insider_cluster",
      actors: `내부자 ${c.insiderCount}명`,
      scale: formatUsd(c.valueUsd),
      days: daysBetween(c.tradeDate, today),
      startedAt: c.tradeDate,
      priceAtSignal,
      baseStrength: 200 + c.insiderCount * 10 + Math.log10(Math.max(1, c.valueUsd)) * 5,
      attentionKey: c.companyName || c.symbol,
    });
  }
  return out;
}

/** KR 거래대금 상위 N 종목의 naverCode 집합(시장 전체 랭킹 헬퍼 부재 → 여기서 산출). */
function tradingValueTopRanks(rows: readonly KrMarketRow[], topN: number): Set<string> {
  const ranked = rows
    .filter((r) => r.naverCode && typeof r.tradingValue === "number")
    .sort((a, b) => (b.tradingValue ?? 0) - (a.tradingValue ?? 0))
    .slice(0, topN);
  return new Set(ranked.map((r) => r.naverCode!));
}

/**
 * 조용한 돈 픽 빌드. 크론에서 호출(요청 경로 무거운 fetch 금지 — 504 원칙).
 * priorPickKeys: 어제 픽의 subject#startedAt 키 — 같은 종목·같은 신호 시작이면 신선도 규칙상 제외.
 */
export async function buildQuietPickResponse(options: {
  date?: string;
  deps?: Partial<QuietPickDeps>;
  priorPickKeys?: ReadonlySet<string>;
  limit?: number;
} = {}): Promise<QuietPickResponse> {
  const deps = { ...defaultDeps, ...options.deps };
  const date = options.date ?? kstDate();
  const limit = options.limit ?? QUIET_PICK_MAX;
  const priorPickKeys = options.priorPickKeys ?? new Set<string>();
  const drops: Record<string, number> = {};
  const drop = (reason: string) => { drops[reason] = (drops[reason] ?? 0) + 1; };

  // ── 신호 검출(①) ──
  const krDefs = deps.vocab.filter((d) => d.naverCode && !d.marquee);
  const krCodes = krDefs.map((d) => d.naverCode!);
  const [histories, insiderRaw, marketRows, attention, rankMap] = await Promise.all([
    deps.readSupplyDemandHistoryByTickers(krCodes, 12).catch(() => ({} as Record<string, InvestorFlow[]>)),
    deps.fetchInsiderClusterCandidates().catch(() => [] as InsiderClusterCandidate[]),
    deps.fetchKrMarketRows().catch(() => [] as KrMarketRow[]),
    deps.computeStockAttentionSignals().catch(() => ({} as Record<string, StockAttentionSignal>)),
    deps.fetchMarketCapRankMap().catch(() => ({})),
  ]);

  const krSignals = detectKrSignals(krDefs, histories);
  const usSignals = detectUsInsiderSignals(insiderRaw, date);
  const allSignals = [...krSignals, ...usSignals];

  // ── 아직 조용함(②) — 값싼 사전 필터 ──
  const marketByCode = new Map(marketRows.filter((r) => r.naverCode).map((r) => [r.naverCode!, r]));
  const topTurnover = tradingValueTopRanks(marketRows, TRADING_VALUE_TOP_RANK);

  const quietCandidates = allSignals.filter((sig) => {
    const mention = attention[sig.attentionKey]?.mentionScore ?? 0;
    if (mention > MAX_MENTION_SCORE) { drop("mention_hot"); return false; }
    if (sig.subject.country === "KR") {
      const row = sig.subject.naverCode ? marketByCode.get(sig.subject.naverCode) : undefined;
      const changePct = row?.changePct;
      if (typeof changePct === "number" && Math.abs(changePct) >= MAX_ABS_CHANGE_PCT) { drop("changed_15"); return false; }
      if (sig.subject.naverCode && topTurnover.has(sig.subject.naverCode)) { drop("turnover_top20"); return false; }
    }
    return true;
  });

  // ── 품질 게이트(③) + 프론트 조립(생존 후보만 — 비용 큰 단계) ──
  const assembled = await Promise.all(
    quietCandidates.map(async (sig) => {
      try {
        const attn = attention[sig.attentionKey];
        const coverage = attn ? { attention: attn } : {};
        const front = sig.subject.country === "KR"
          ? await deps.assembleStockFront(sig.subject.canonical, rankMap, coverage, sig.subject.naverCode ? { naverCode: sig.subject.naverCode } : {})
          : await deps.assembleStockFront(sig.subject.canonical, rankMap, coverage, sig.subject.symbol ? { symbol: sig.subject.symbol } : {});
        return { sig, front };
      } catch {
        return { sig, front: null as StockFrontData | null };
      }
    })
  );

  const picks: QuietPick[] = [];
  for (const { sig, front } of assembled) {
    if (!front) { drop("front_failed"); continue; }
    if (!front.verdict) { drop("no_verdict"); continue; }
    if ((front.candles?.length ?? 0) < MIN_CANDLES) { drop("insufficient_candles"); continue; }

    const current = parsePriceText(front.priceText) ?? front.candles?.at(-1)?.close ?? null;
    if (!current || current <= 0) { drop("no_price"); continue; }

    // 당일 등락 재확인(US 및 KR 공통 — front.signals.changePct 우선).
    const changePct = front.signals.changePct;
    if (typeof changePct === "number" && Math.abs(changePct) >= MAX_ABS_CHANGE_PCT) { drop("changed_15"); continue; }

    // 유동성(KR).
    if (sig.subject.country === "KR" && sig.subject.naverCode) {
      const tv = marketByCode.get(sig.subject.naverCode)?.tradingValue;
      if (typeof tv === "number" && tv < KR_MIN_TRADING_VALUE) { drop("illiquid"); continue; }
    }

    // 신호 시작가 확정 + 누적 상승 게이트(②).
    const priceAtSignal = sig.priceAtSignal
      ?? (sig.subject.country === "KR" ? krCloseAtOrBefore(front, sig.startedAt) : null)
      ?? current;
    const cumulativePct = ((current - priceAtSignal) / priceAtSignal) * 100;
    if (cumulativePct >= MAX_CUMULATIVE_SINCE_SIGNAL_PCT) { drop("ran_30_since_signal"); continue; }

    // 신선도 — 같은 종목·같은 신호 시작이면 제외(신호 갱신 시만 재편입).
    const freshnessKey = `${sig.subject.canonical}#${sig.startedAt}`;
    if (priorPickKeys.has(freshnessKey)) { drop("stale_repeat"); continue; }

    const score = front.score?.score ?? null;
    const timingGrade = timingGradeOf(front.verdict);
    const valuationGrade = valuationGradeOf(score);
    const zone = front.wyckoff?.currentZone;

    picks.push({
      subject: sig.subject,
      price: {
        current,
        ...(front.priceText ? { currentText: front.priceText } : {}),
        ...(typeof changePct === "number" ? { changePct } : {}),
        sparkline: front.sparkline ?? [],
      },
      signal: {
        kind: sig.kind,
        code: sig.code,
        actors: sig.actors,
        scale: sig.scale,
        days: sig.days,
        priceAtSignal,
        startedAt: sig.startedAt,
        strength: sig.baseStrength,
      },
      hook: buildQuietPickHook({ kind: sig.kind, actors: sig.actors, scale: sig.scale, days: sig.days }),
      invalidation: {
        level: front.verdict.invalidationLevel ?? null,
        text: front.verdict.invalidation ?? "무효선 계산에 캔들이 더 필요해요",
      },
      conviction: {
        whyCompany: front.score?.interpretation || front.score?.label || "",
        whyNow: {
          ...(front.verdict.phase ? { phase: front.verdict.phase } : {}),
          ...(front.wyckoff?.summary ? { summary: front.wyckoff.summary } : {}),
          ...(zone ? { keyLevels: { low: zone.low, high: zone.high } } : {}),
        },
        committee: {
          timingGrade,
          valuationGrade,
          verdict1line: committeeVerdictLine(timingGrade, valuationGrade),
        },
      },
      companyScore: score,
      qualifiedAt: date,
    });
  }

  // ── 강도순 정렬 + 상위 N(억지 충원 금지) ──
  picks.sort((a, b) => b.signal.strength - a.signal.strength);
  const published = picks.slice(0, limit);

  return {
    asOf: new Date().toISOString(),
    date,
    picks: published,
    qualification: {
      krUniverse: krDefs.length,
      krWithSignal: krSignals.length,
      usInsiderRaw: insiderRaw.length,
      usWithSignal: usSignals.length,
      afterQuiet: quietCandidates.length,
      afterQuality: picks.length,
      published: published.length,
      drops,
    },
    source: "quiet-pick-engine",
  };
}

/** 신선도 비교용 키 — 어제 픽 응답에서 subject#startedAt 집합 추출. */
export function quietPickFreshnessKeys(response: QuietPickResponse | null): Set<string> {
  const keys = new Set<string>();
  for (const pick of response?.picks ?? []) keys.add(`${pick.subject.canonical}#${pick.signal.startedAt}`);
  return keys;
}

/**
 * 발행 즉시 판단 원장 append 용 엔트리(성적표 채점 원료 — G1-C).
 * kind="selection" 재사용(DDL 없음) · actor="committee"(픽=위원회 검수) · payload.pickType="quiet" 로 구분.
 * lean payload(stock/front/response 제외) → daily-30 덱 재조립에 섞이지 않음. materializeLedgerOutcomes 가 7/30/90일 자동 채점.
 */
export function quietPickLedgerEntries(response: QuietPickResponse): LedgerAppendInput[] {
  return response.picks.map((pick, index) => {
    const asset = assetForStock({ country: pick.subject.country, market: pick.subject.market });
    const baseKey = `${response.date}:${asset}:${pick.subject.symbol ?? pick.subject.canonical}:quiet-pick`;
    return {
      date: response.date,
      subject: {
        asset,
        canonical: pick.subject.canonical,
        ...(pick.subject.symbol ? { symbol: pick.subject.symbol } : {}),
      },
      kind: "selection" as const,
      payload: {
        pickType: "quiet",
        signalTypes: [pick.signal.code],
        headline: pick.hook,
        market: pick.subject.market,
        country: pick.subject.country,
        ...(pick.subject.naverCode ? { naverCode: pick.subject.naverCode } : {}),
        ...(scoreBand(pick.companyScore) ? { scoreBand: scoreBand(pick.companyScore) } : {}),
        ...(pick.companyScore != null ? { companyScore: pick.companyScore } : {}),
        order: index,
        signal: {
          kind: pick.signal.kind,
          actors: pick.signal.actors,
          scale: pick.signal.scale,
          days: pick.signal.days,
          priceAtSignal: pick.signal.priceAtSignal,
          startedAt: pick.signal.startedAt,
        },
      },
      priceAt: pick.price.current,
      actor: "committee" as const,
      idempotencyKey: ledgerKey(baseKey, "selection"),
    };
  });
}
