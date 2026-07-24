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
  computeQuietPickAnomalies,
  buildCommitteeVerdictLine,
  type StockDef,
  type InvestorFlow,
  type CardVerdict,
  type WyckoffAnalysis,
  type CompanyScoreResult,
  type SignalTypeCode,
  type QuietPickSignalKind,
  type QuietPickAnomaly,
  type QuietPickAnomalyFacts,
} from "@fomo/core";
import { kstDate } from "./fomo";
import { parsePriceText } from "./quote-prices";
import { readSupplyDemandHistoryByTickers } from "./supply-demand-store";
import { computeStockAttentionSignals, type StockAttentionSignal } from "./stock-signal-coverage";
import { fetchKrMarketRows } from "./discovery-supply";
import { fetchInsiderClusterCandidates, fetchInsiderPriorBuys, type InsiderClusterCandidate } from "./insider-source";
import { fetchCachedUsMarketRows } from "./us-market-source";
import { usDiscoverySeedForSymbol } from "./us-symbols";
import { writeUsCandleCache } from "./us-candle-cache";
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
/**
 * 품질 게이트(WO-P1) — 캔들 200거래일 강제. 예외 없음.
 *
 * 60이었을 때 CLBK(재상장으로 Nasdaq 이력 3봉)가 픽 시점 TwelveData 응답으로만 통과했다가
 * 요청 시점엔 3봉으로 퇴화해 "가격 이력 3거래일" 빈 껍데기가 나갔다. 하이드레이션(캔들 봉인)
 * 후에도 200일 미확보면 그 종목은 탈락 — 무료 소스에 없는 이력을 만들어낼 방법은 없다.
 */
const MIN_CANDLES = 200;
/** 유동성 하한(KR 일 거래대금 10억원). */
const KR_MIN_TRADING_VALUE = 1_000_000_000;
/** 조용함 게이트: US 시총 상한($50B 초과=대형주, 정의상 조용할 수 없음 — Elevance 누출 차단). */
const US_MEGA_CAP_USD = 50_000_000_000;
/** 조용함 게이트: KR 시총 순위 상위 N 제외(대형주는 조용할 수 없음). */
const KR_MEGA_CAP_RANK = 100;
/** KR 최장 streak 비교에 쓰는 조회 창(거래일). */
const KR_STREAK_WINDOW = 40;
/** 하루 최대 픽 수(미달이면 그 수만큼 — 억지 충원 금지). */
export const QUIET_PICK_MAX = 10;

// ── 스키마(카드·뎁스가 소비할 단일 페이로드) ──────────────────────────────
export interface QuietPickSubject {
  canonical: string;
  symbol?: string;
  naverCode?: string;
  market: string;
  country: "KR" | "US";
  /** 회사 정체 한 줄(8~15자, 한국어 보장) — 판단의 최소 조건. */
  identity?: string;
}

/** 픽별 데이터 완결성 로그(WO-P1) — 어드민·자가검증에서 빈 껍데기 픽을 잡는 근거. */
export interface QuietPickDataQuality {
  candles: number;
  /** 봉인(캐시) 후 확보된 캔들 길이 — 요청 경로가 재현할 수 있는 실제 길이. */
  sealedCandles?: number;
  fundamentals: boolean;
  ticker: boolean;
  identity: boolean;
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
  /** 이례성 지표(카드 칩·훅 원료) — 최소 1개(0개면 발행 안 함). 강도 내림차순. */
  anomalies: QuietPickAnomaly[];
  invalidation: QuietPickInvalidation;
  conviction: QuietPickConviction;
  /** 종합점수(내부화 — 화면 노출 아님, 픽 근거·성적표 밴드용). */
  companyScore: number | null;
  /** 데이터 완결성 게이트 로그(WO-P1). */
  dataQuality: QuietPickDataQuality;
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
  fetchInsiderPriorBuys: typeof fetchInsiderPriorBuys;
  fetchCachedUsMarketRows: typeof fetchCachedUsMarketRows;
  fetchMarketCapRankMap: typeof fetchMarketCapRankMap;
  assembleStockFront: typeof assembleStockFront;
  /** 픽 시점 캔들 봉인(WO-P1) — 병합 후 확보된 길이를 돌려준다. */
  writeUsCandleCache: typeof writeUsCandleCache;
}

const defaultDeps: QuietPickDeps = {
  vocab: STOCK_VOCAB,
  fetchKrMarketRows,
  readSupplyDemandHistoryByTickers,
  computeStockAttentionSignals,
  fetchInsiderClusterCandidates,
  fetchInsiderPriorBuys,
  fetchCachedUsMarketRows,
  fetchMarketCapRankMap,
  assembleStockFront,
  writeUsCandleCache,
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

/**
 * openinsider 영문 산업명(SIC 계열) → 짧은 한국어. WO-P1: **영문 원문 축약 노출 금지**
 * ("Computer Processing & Da" 같은 잘린 영문이 카드에 뜨던 회귀). 매칭 실패 시 한국어 폴백.
 */
const INDUSTRY_KO: ReadonlyArray<[RegExp, string]> = [
  [/bank|savings institution|credit union/i, "은행"],
  [/insurance|title insurance/i, "보험"],
  [/blank check/i, "스팩"],
  [/investment advice|security broker|asset manage|finance services|personal credit/i, "금융"],
  [/semiconductor/i, "반도체"],
  [/prepackaged software|software|computer processing|data preparation|information retrieval|internet/i, "소프트웨어"],
  [/computer communications|telephone|communications services|radiotelephone/i, "통신"],
  [/computer & office|computer storage|electronic computer/i, "컴퓨터·하드웨어"],
  [/pharmaceutical|biological product|in vitro|medicinal chem/i, "바이오·제약"],
  [/surgical|medical instrument|dental|orthopedic|laboratory analytic/i, "의료기기"],
  [/health service|hospital|nursing|medical labor/i, "헬스케어"],
  [/crude petroleum|natural gas|petroleum refin|oil & gas|drilling/i, "에너지"],
  [/electric service|electric & other service|gas distribution|water suppl|cogeneration/i, "유틸리티"],
  [/gold mining|metal mining|copper|coal|nonmetallic mineral/i, "광업"],
  [/real estate|reit|land subdivider|operators of apartment/i, "부동산"],
  [/eating & drinking|restaurant|grocer|food|beverage|bakery|sugar|dairy/i, "음식료"],
  [/retail|catalog|department store|apparel & accessory|variety store/i, "소비재·유통"],
  [/ordnance|guided missile|defense|arms/i, "방산"],
  [/aircraft|aerospace|space vehicle/i, "항공우주"],
  [/motor vehicle|automotive|truck|auto parts/i, "자동차"],
  [/air transportation|trucking|railroad|water transportation|courier/i, "운송"],
  [/electrical industrial|electric lighting|electronic component|electrical work|miscellaneous electrical/i, "전기·전자"],
  [/industrial machinery|machine tool|construction machinery|special industry machinery|engines/i, "산업기계"],
  [/general building|construction|heavy construction|water, sewer/i, "건설"],
  [/chemical|plastics|paint|adhesive|industrial gas|fertilizer/i, "화학"],
  [/steel|metal|iron|aluminum|fabricated/i, "철강·금속"],
  [/paper|pulp|printing|publishing|newspaper/i, "제지·인쇄"],
  [/textile|apparel|footwear|leather/i, "의류·섬유"],
  [/tobacco|cigarette/i, "담배"],
  [/hotel|amusement|recreation|motion picture|broadcast|television|cable/i, "미디어·레저"],
  [/education|school/i, "교육"],
  [/business service|management consult|help supply|advertising|engineering service|computer service/i, "기업서비스"],
  [/agricultur|farm|forestry|fishing/i, "농업"],
  [/wholesale|distribution/i, "도매·유통"],
  [/instrument|measuring|photographic|optical|laboratory apparatus/i, "정밀기기"],
  [/furniture|household appliance|lumber|glass|cement|concrete/i, "건자재·가구"],
  [/toys|sporting goods|jewelry|musical/i, "생활용품"],
];

const IDENTITY_FALLBACK: Record<"KR" | "US", string> = { KR: "기타 업종", US: "미국주식" };
const HANGUL = /[가-힣]/;

/**
 * 회사 정체 한 줄(8~15자) — 한국어만. 우선순위: front 섹터 라벨 → 큐레이션 시드 섹터 →
 * 영문 산업명 한국어 매핑 → 한국어 폴백. 영문 원문은 어떤 경로로도 노출되지 않는다(WO-P1).
 */
function companyIdentity(front: StockFrontData, sig: SignalCandidate): string {
  const theme = front.signals.themeLabel?.trim();
  if (theme && HANGUL.test(theme)) return theme.slice(0, 20);
  const seedSector = sig.subject.symbol ? usDiscoverySeedForSymbol(sig.subject.symbol)?.sector?.trim() : undefined;
  if (seedSector && HANGUL.test(seedSector)) return seedSector.slice(0, 20);
  const industry = sig.industry?.trim();
  if (industry) {
    for (const [pattern, ko] of INDUSTRY_KO) if (pattern.test(industry)) return ko;
  }
  return IDENTITY_FALLBACK[sig.subject.country];
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

/** 20일 평균 거래량(주식수). 캔들 부족이면 undefined. */
function avg20Volume(front: StockFrontData): number | undefined {
  const vols = (front.candles ?? []).map((c) => c.volume).filter((v) => typeof v === "number" && v > 0);
  const window = vols.slice(-20);
  if (window.length < 5) return undefined;
  return window.reduce((a, b) => a + b, 0) / window.length;
}

/** 창 내 최장 연속 순매수 일수(현재 streak 이 최장인지 판정용). */
function maxPositiveRun(nets: readonly number[]): number {
  let best = 0;
  let run = 0;
  for (const net of nets) {
    if (net > 0) { run += 1; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

// ── 후보(신호 검출 결과) ────────────────────────────────────────────────
interface SignalCandidate {
  subject: QuietPickSubject;
  kind: QuietPickSignalKind;
  code: SignalTypeCode;
  /** 주체 명사(조사 붙이기 전) — "내부자"/"외국인"/"기관"/"외국인·기관". */
  actorNoun: string;
  actors: string;
  scale: string;
  days: number;
  startedAt: string;
  /** US 는 공시가 신호가격, KR 은 캔들에서 확정. */
  priceAtSignal?: number;
  /** 당일 등락률 힌트(US=insider quote). front.signals.changePct 결측 시 폴백. */
  changePctHint?: number;
  baseStrength: number;
  attentionKey: string;
  // 이례성 원료(검출 단계에서 확보).
  insiderCount?: number;
  valueUsd?: number;
  buyPrice?: number;
  industry?: string;
  /** KR: 창 내 순매수 총량(dominant investor). scale·규모 상대화용. */
  streakSum?: number;
  /** KR: 현재 streak 이 창 내 최장인가. */
  isLongestStreak?: boolean;
  streakWindowDays?: number;
}

// ── 위원회 등급(등급 기반 결정론 — 소견 문장은 fomo-core buildCommitteeVerdictLine) ──
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

    const foreignNets = flows.map((f) => f.foreignNet);
    const instNets = flows.map((f) => f.institutionNet);
    const foreign = positiveStreak(flows.map((f) => ({ net: f.foreignNet, date: f.date })));
    const inst = positiveStreak(flows.map((f) => ({ net: f.institutionNet, date: f.date })));
    const foreignLongest = foreign.days >= maxPositiveRun(foreignNets);
    const instLongest = inst.days >= maxPositiveRun(instNets);
    const window = flows.length;
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
        actorNoun: "외국인·기관",
        actors: "외국인·기관",
        scale: `${formatShares(foreign.sum + inst.sum)} 매집`,
        days: Math.min(foreign.days, inst.days),
        startedAt: foreign.startedAt < inst.startedAt ? inst.startedAt : foreign.startedAt,
        baseStrength: 300 + Math.min(foreign.days, inst.days) * 5,
        attentionKey: def.canonical,
        streakSum: foreign.sum + inst.sum,
        isLongestStreak: foreignLongest && instLongest,
        streakWindowDays: window,
      });
    } else if (foreignQualified) {
      out.push({
        subject,
        kind: "foreign_streak",
        code: "foreign_streak",
        actorNoun: "외국인",
        actors: "외국인",
        scale: formatShares(foreign.sum),
        days: foreign.days,
        startedAt: foreign.startedAt,
        baseStrength: 100 + foreign.days * 10,
        attentionKey: def.canonical,
        streakSum: foreign.sum,
        isLongestStreak: foreignLongest,
        streakWindowDays: window,
      });
    } else {
      out.push({
        subject,
        kind: "institution_streak",
        code: "institution_streak",
        actorNoun: "기관",
        actors: "기관",
        scale: formatShares(inst.sum),
        days: inst.days,
        startedAt: inst.startedAt,
        baseStrength: 100 + inst.days * 10,
        attentionKey: def.canonical,
        streakSum: inst.sum,
        isLongestStreak: instLongest,
        streakWindowDays: window,
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
      actorNoun: "내부자",
      actors: `내부자 ${c.insiderCount}명`,
      scale: formatUsd(c.valueUsd),
      days: daysBetween(c.tradeDate, today),
      startedAt: c.tradeDate,
      priceAtSignal,
      ...(typeof c.quote?.changePct === "number" ? { changePctHint: c.quote.changePct } : {}),
      baseStrength: 200 + c.insiderCount * 10 + Math.log10(Math.max(1, c.valueUsd)) * 5,
      attentionKey: c.companyName || c.symbol,
      insiderCount: c.insiderCount,
      valueUsd: c.valueUsd,
      ...(typeof c.buyPrice === "number" ? { buyPrice: c.buyPrice } : {}),
      ...(c.industry ? { industry: c.industry } : {}),
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
  const [histories, insiderRaw, marketRows, attention, rankMap, usRows] = await Promise.all([
    deps.readSupplyDemandHistoryByTickers(krCodes, KR_STREAK_WINDOW).catch(() => ({} as Record<string, InvestorFlow[]>)),
    deps.fetchInsiderClusterCandidates().catch(() => [] as InsiderClusterCandidate[]),
    deps.fetchKrMarketRows().catch(() => [] as KrMarketRow[]),
    deps.computeStockAttentionSignals().catch(() => ({} as Record<string, StockAttentionSignal>)),
    deps.fetchMarketCapRankMap().catch(() => ({} as Awaited<ReturnType<typeof fetchMarketCapRankMap>>)),
    deps.fetchCachedUsMarketRows().catch(() => [] as KrMarketRow[]),
  ]);

  const krSignals = detectKrSignals(krDefs, histories);
  const usSignals = detectUsInsiderSignals(insiderRaw, date);
  const allSignals = [...krSignals, ...usSignals];

  // ── 아직 조용함(②) — 값싼 사전 필터 ──
  const marketByCode = new Map(marketRows.filter((r) => r.naverCode).map((r) => [r.naverCode!, r]));
  const topTurnover = tradingValueTopRanks(marketRows, TRADING_VALUE_TOP_RANK);
  // US 시총 맵(대형주 게이트 + 규모 상대화). symbol → marketCapUsd.
  const usMcap = new Map<string, number>();
  for (const r of usRows) if (r.symbol && typeof r.marketCapUsd === "number") usMcap.set(r.symbol.toUpperCase(), r.marketCapUsd);

  const quietCandidates = allSignals.filter((sig) => {
    const mention = attention[sig.attentionKey]?.mentionScore ?? 0;
    if (mention > MAX_MENTION_SCORE) { drop("mention_hot"); return false; }
    if (sig.subject.country === "KR") {
      const row = sig.subject.naverCode ? marketByCode.get(sig.subject.naverCode) : undefined;
      const changePct = row?.changePct;
      if (typeof changePct === "number" && Math.abs(changePct) >= MAX_ABS_CHANGE_PCT) { drop("changed_15"); return false; }
      if (sig.subject.naverCode && topTurnover.has(sig.subject.naverCode)) { drop("turnover_top20"); return false; }
      // 대형주 제외 — 시총 순위 상위 N.
      const rank = sig.subject.naverCode ? rankMap[sig.subject.naverCode]?.rank : undefined;
      if (typeof rank === "number" && rank <= KR_MEGA_CAP_RANK) { drop("mega_cap"); return false; }
    } else {
      // US 대형주 제외($50B 초과) — Elevance 급 누출 차단.
      const cap = sig.subject.symbol ? usMcap.get(sig.subject.symbol.toUpperCase()) : undefined;
      if (typeof cap === "number" && cap > US_MEGA_CAP_USD) { drop("mega_cap"); return false; }
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

    // ── 하이드레이션(WO-P1) — 픽 시점 캔들을 봉인. US 무료 소스는 날마다 다르게 답하므로
    //    (TwelveData 쿼터·Nasdaq 종목별 이력) 봉인이 없으면 요청 경로가 3봉으로 퇴화한다.
    const liveCandles = front.candles ?? [];
    let sealedCandles = liveCandles.length;
    if (sig.subject.country === "US" && sig.subject.symbol && liveCandles.length > 0) {
      sealedCandles = await deps.writeUsCandleCache(sig.subject.symbol, liveCandles).catch(() => liveCandles.length);
    }
    // 자격 ③ 강제 — 하이드레이션 후에도 200일 미확보면 탈락. 예외 없음(빈 껍데기 픽 금지).
    const availableCandles = Math.max(liveCandles.length, sealedCandles);
    if (availableCandles < MIN_CANDLES) { drop("insufficient_candles"); continue; }

    // 무효선(실계산 레벨)이 없거나 0 이하면 픽 불가 — "0원 이탈" 같은 무의미 문구 노출 금지(실측 회귀).
    const invalidationLevel = front.verdict.invalidationLevel;
    if (typeof invalidationLevel !== "number" || invalidationLevel <= 0) { drop("no_invalidation"); continue; }

    const current = parsePriceText(front.priceText) ?? front.candles?.at(-1)?.close ?? null;
    if (!current || current <= 0) { drop("no_price"); continue; }

    // 당일 등락 재확인(US 및 KR 공통). front.signals.changePct → KR market row → US insider quote 순 폴백.
    const rowChangePct = sig.subject.country === "KR" && sig.subject.naverCode
      ? marketByCode.get(sig.subject.naverCode)?.changePct
      : undefined;
    const changePct = front.signals.changePct ?? rowChangePct ?? sig.changePctHint;
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

    // ── 이례성 지표(WO-G1A2) — 보유 수치만. 하나도 없으면 후킹 없는 픽 → 발행 제외. ──
    const avgVol = avg20Volume(front);
    let volumePct: number | undefined;
    let mcapPct: number | undefined;
    if (sig.subject.country === "KR") {
      if (avgVol && sig.streakSum && sig.days > 0) volumePct = ((sig.streakSum / sig.days) / avgVol) * 100;
    } else {
      const shares = sig.valueUsd && sig.buyPrice ? sig.valueUsd / sig.buyPrice : undefined;
      if (avgVol && shares) volumePct = (shares / avgVol) * 100;
      const cap = sig.subject.symbol ? usMcap.get(sig.subject.symbol.toUpperCase()) : undefined;
      if (cap && sig.valueUsd) mcapPct = (sig.valueUsd / cap) * 100;
    }
    // US 빈도(지난 12개월 내부자 매수 건수) — 생존 후보만 조회(비용 큰 per-ticker fetch).
    let priorBuys12mo: number | undefined;
    if (sig.subject.country === "US" && sig.subject.symbol) {
      priorBuys12mo = await deps.fetchInsiderPriorBuys(sig.subject.symbol).catch(() => undefined);
    }
    const mentionCount = attention[sig.attentionKey]?.mentionCount;
    const facts: QuietPickAnomalyFacts = {
      kind: sig.kind,
      actorNoun: sig.actorNoun,
      scale: sig.scale,
      days: sig.days,
      ...(typeof sig.insiderCount === "number" ? { insiderCount: sig.insiderCount } : {}),
      ...(typeof priorBuys12mo === "number" ? { priorBuys12mo } : {}),
      ...(typeof volumePct === "number" ? { volumePct } : {}),
      ...(typeof mcapPct === "number" ? { mcapPct } : {}),
      ...(typeof mentionCount === "number" ? { mentionCount } : {}),
      ...(typeof front.signals.volumeRatio === "number" ? { volumeElevated: front.signals.volumeRatio >= 1 } : {}),
      ...(typeof sig.isLongestStreak === "boolean" ? { isLongestStreak: sig.isLongestStreak } : {}),
      ...(typeof sig.streakWindowDays === "number" ? { streakWindowDays: sig.streakWindowDays } : {}),
    };
    const anomalies = computeQuietPickAnomalies(facts);
    if (anomalies.length === 0) { drop("no_anomaly"); continue; }
    const identity = companyIdentity(front, sig);
    const dataQuality: QuietPickDataQuality = {
      candles: availableCandles,
      ...(sealedCandles !== liveCandles.length ? { sealedCandles } : {}),
      fundamentals: typeof score === "number",
      ticker: Boolean(sig.subject.symbol),
      identity: identity.length > 0,
    };

    picks.push({
      subject: { ...sig.subject, identity },
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
      hook: buildQuietPickHook(facts),
      anomalies,
      invalidation: {
        level: invalidationLevel,
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
          verdict1line: buildCommitteeVerdictLine(anomalies, timingGrade, valuationGrade),
        },
      },
      companyScore: score,
      dataQuality,
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
