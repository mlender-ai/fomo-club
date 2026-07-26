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
  sectorOf,
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
  buildSignalStatsCopy,
  companyDisplay,
  type SignalStats,
} from "@fomo/core";
import { kstDate } from "./fomo";
import { parsePriceText } from "./quote-prices";
import { readSupplyDemandHistoryByTickers } from "./supply-demand-store";
import { computeStockAttentionSignals, type StockAttentionSignal } from "./stock-signal-coverage";
import { fetchKrMarketRows } from "./discovery-supply";
import { fetchInsiderClusterCandidates, fetchInsiderPriorBuys, type InsiderClusterCandidate } from "./insider-source";
import { fetchCachedUsMarketRows } from "./us-market-source";
import { usDiscoverySeedForSymbol } from "./us-symbols";
import { fetchDartInsiderPurchasesByStock, type DartDisclosureHit } from "./dart-disclosures";
import { writeUsCandleCache } from "./us-candle-cache";
import { assembleStockFront, fetchMarketCapRankMap, type StockFrontData } from "./stock-front";
import { assetForStock, ledgerKey, scoreBand, type LedgerAppendInput } from "./judgment-ledger";
import { readSignalStatsForCards } from "./signal-stats";

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
 * 이 이상은 데이터 이상으로 본다(WO-P4 실측: TSM 445% — openinsider 원주 TWD 가격 vs ADR 달러가).
 * 픽도 선반도 아니고 조용히 제외 — 틀린 숫자 노출이 빈 선반보다 나쁘다.
 */
const IMPLAUSIBLE_CUMULATIVE_PCT = 200;
/**
 * 품질 게이트(WO-P1) — 캔들 200거래일 강제. 예외 없음.
 *
 * 60이었을 때 CLBK(재상장으로 Nasdaq 이력 3봉)가 픽 시점 TwelveData 응답으로만 통과했다가
 * 요청 시점엔 3봉으로 퇴화해 "가격 이력 3거래일" 빈 껍데기가 나갔다. 하이드레이션(캔들 봉인)
 * 후에도 200일 미확보면 그 종목은 탈락 — 무료 소스에 없는 이력을 만들어낼 방법은 없다.
 */
const MIN_CANDLES = 200;
/**
 * 유동성 하한(WO-P4) — 원 단위 3억원. 개인 기준 일 3억이면 매매 가능.
 *
 * ★실측 정정: 어제 "illiquid 12"의 진짜 원인은 임계값(10억)이 아니라 **단위 불일치**였다.
 * 네이버 accumulatedTradingValue 는 백만원 단위인데 원으로 비교해서 **삼성전자조차 탈락**하는
 * 상태였다(6,628,392 < 1,000,000,000). discovery-supply 에서 원 단위로 정규화해 해결.
 */
const KR_MIN_TRADING_VALUE = 300_000_000;
/** 이 미만은 픽 가능하되 카드에 "거래가 얇아요"를 표기한다(숨기지 않고 알린다). */
const KR_THIN_TRADING_VALUE = 1_000_000_000;
/** 대형주 판정선. 초과분은 '이진 컷'이 아니라 아래 조건부 통과 규칙을 적용한다. */
const US_MEGA_CAP_USD = 50_000_000_000;
/** 대형주 조건부 통과 — 매수액이 시총의 이 % 이상이면 이례적이라 통과. */
const MEGA_CAP_MIN_MCAP_PCT = 0.05;
/** 대형주 조건부 통과 — 내부자 이 인원 이상이면 임원진 대거 매수라 통과. */
const MEGA_CAP_MIN_INSIDERS = 5;
/** 조용함 게이트: KR 시총 순위 상위 N(대형주). KR 도 조건부 — 다중 주체·규모 이례성이면 통과. */
const KR_MEGA_CAP_RANK = 100;
/** DART 내부자 장내매수 최소 규모(원) — 소액 신고 노이즈 컷. */
const DART_INSIDER_MIN_VALUE = 50_000_000;
/** 수급 전환 신호: 직전 N일 누적 순매도 → 최근 M일 순매수 전환. */
const REVERSAL_LOOKBACK_DAYS = 20;
const REVERSAL_CONFIRM_DAYS = 3;
/** 지켜보는 중 선반 최대 노출(WO-P4). */
export const QUIET_WATCH_MAX = 10;
/** 프론트 조립 상한(크론 비용) — 강도순 상위만. 초과분은 로그로 남긴다(조용한 truncation 금지). */
const MAX_FRONT_ASSEMBLIES = 60;
/** KR 최장 streak 비교에 쓰는 조회 창(거래일). */
const KR_STREAK_WINDOW = 40;
/** 하루 최대 픽 수(미달이면 그 수만큼 — 억지 충원 금지). */
export const QUIET_PICK_MAX = 10;

// ── 스키마(카드·뎁스가 소비할 단일 페이로드) ──────────────────────────────
/** 검출 단계의 종목 식별자(표기 정규화 전). 발행 시점에 QuietPickSubject 로 확정된다. */
export interface QuietPickSubjectSeed {
  /** 원장·조인 키(원문 유지 — 바꾸면 과거 기록과 끊긴다). 화면 표기엔 쓰지 않는다. */
  canonical: string;
  symbol?: string;
  naverCode?: string;
  market: string;
  country: "KR" | "US";
  /** 회사 정체 한 줄(8~15자, 한국어 보장) — 판단의 최소 조건. */
  identity?: string;
}

export interface QuietPickSubject extends QuietPickSubjectSeed {
  /**
   * 화면 표기용 회사명(WO-P6 ③) — 법인 접미·주 꼬리 제거("Columbia Financial, Inc./Md/"
   * → "Columbia Financial"). **카드·뎁스·성적표·원장·공유가 전부 이 값을 쓴다.**
   */
  displayName: string;
  /** 티커(US 심볼 / KR 6자리 코드) — 이름과 분리해 병기용. */
  ticker?: string;
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
  /** 내부자 인원(US 클러스터) — 강화 재등장 판정에 쓴다. */
  insiderCount?: number;
  /**
   * 신호 규모의 실수치(US=매수금액 USD, KR=순매수 총량). 화면에 직접 쓰진 않지만
   * **내일 재등장 판정의 기준**이 된다(scale 문자열은 버킷이라 5% 증가를 못 본다).
   */
  amount?: number;
  /**
   * 신호 강화 재등장 문구(WO-P4) — 어제 픽과 같은 신호가 **더 강해졌을 때만** 채운다.
   * 예 "5일째 계속 — 어제보다 2명 늘었어요". 순수 반복(변화 0)은 픽에서 제외된다.
   */
  progress?: string;
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
  /** 유동성 경고(WO-P4) — 하한은 넘었지만 얇은 종목. 숨기지 않고 카드에 표기한다. */
  liquidityNote?: string;
  /**
   * 이 신호의 과거 성적(WO-P2 §2) — 승률·중앙값·하락비율 세트. 카드가 "무조건 오르나?"에 답하는 근거.
   * 통계가 없는 유형이면 필드 자체가 없다 → 카드는 블록을 통째로 숨긴다(빈 껍데기 금지).
   */
  signalStats?: SignalStatsCard;
  qualifiedAt: string;
}

/** 카드에 실리는 신호 성적(표시에 필요한 값만 — 원본 SignalStats 의 30일 지평 축약). */
export interface SignalStatsCard {
  /** 표본 수. */
  n: number;
  /** 오른 건수 / 승률(%). */
  up: number;
  winRate: number;
  /** 내린 건수 / 하락 비율(%) — 상승만 말하지 않기 위한 필수 짝. */
  down: number;
  downRate: number;
  /** 수익률 중앙값(%). */
  medianReturn: number;
  /** 채점 지평(거래일). */
  windowDays: number;
  /** "과거 데이터 역산" | "우리 실전 기록". */
  sourceLabel: string;
  /** 방법론 한 줄(정직 규칙 ②). */
  method: string;
  /** 카드 문구 — 승률+하락이 한 문장 세트. */
  headline: string;
  detail: string;
}

/** 지켜보는 중 미달 사유 코드(WO-P4) — 유저어 문구는 reasonText. */
export type QuietWatchReasonCode =
  | "illiquid"
  | "mega_cap"
  | "ran_30_since_signal"
  | "changed_15"
  | "mention_hot"
  | "turnover_top20";

/**
 * 지켜보는 중(WO-P4) — 신호는 실재하는데 픽 자격 ②에 못 미친 후보.
 * 간이 카드용 최소 정보만 담는다(픽 승격이 아니라 별도 선반).
 */
export interface QuietWatchItem {
  subject: QuietPickSubject;
  signal: Pick<QuietPickSignal, "kind" | "code" | "actors" | "scale" | "days">;
  price?: { current?: number; currentText?: string; changePct?: number };
  reasonCode: QuietWatchReasonCode;
  /** 유저어 미달 사유 — "거래가 얇아요 (일 1.2억)" 처럼 수치까지. 이 섹션의 존재 이유다. */
  reasonText: string;
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
  /** 지켜보는 중 선반 노출 수(WO-P4). */
  watching: number;
  drops: Record<string, number>;
}

export interface QuietPickResponse {
  asOf: string;
  date: string;
  picks: QuietPick[];
  /** 2단 구조 하단 선반(WO-P4) — 신호 있으나 픽 기준 미달. 픽 승격 아님. */
  watching: QuietWatchItem[];
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
  /** KR 내부자 장내매수 공시(WO-P4 신호망 확장). */
  fetchDartInsiderPurchasesByStock: typeof fetchDartInsiderPurchasesByStock;
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
  fetchDartInsiderPurchasesByStock,
};

// ── 수치 포매터(실측만) ────────────────────────────────────────────────
function formatShares(shares: number): string {
  const abs = Math.abs(Math.round(shares));
  if (abs >= 10_000) return `${Math.round(abs / 10_000).toLocaleString("en-US")}만주`;
  return `${abs.toLocaleString("en-US")}주`;
}

/** 원화 규모 — "4.6억원" / "3,200만원". 실값만. */
function formatWon(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(abs / 100_000_000).toFixed(1)}억원`;
  if (abs >= 10_000) return `${Math.round(abs / 10_000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(abs).toLocaleString("ko-KR")}원`;
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
  // KR 은 STOCK_VOCAB 섹터 사전을 쓴다(방산·AI·바이오·원자력·반도체…) — "기타 업종" 남발 방지.
  // 사전 값은 큐레이션된 라벨이라 한글 검사를 적용하지 않는다("AI"가 영문이라 거부되던 회귀).
  const krSector = sig.subject.country === "KR" ? sectorOf(sig.subject.canonical) : undefined;
  if (krSector) return krSector;
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

/**
 * 거래량 진공 비율(WO-P4) — 최근 20일 평균 ÷ 그 앞 60일 평균. 0.6 이하면 "거래가 말라 있었다".
 * 캔들만으로 계산(보유 데이터). 표본 부족이면 undefined(가짜 수치 금지).
 */
function volumeVacuumRatio(front: StockFrontData): number | undefined {
  const vols = (front.candles ?? []).map((c) => c.volume).filter((v) => typeof v === "number" && v > 0);
  if (vols.length < 80) return undefined;
  const recent = vols.slice(-20);
  const prior = vols.slice(-80, -20);
  if (recent.length < 20 || prior.length < 40) return undefined;
  const avg = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  const priorAvg = avg(prior);
  if (priorAvg <= 0) return undefined;
  return avg(recent) / priorAvg;
}

/** 52주 저점 대비 현재가 위치(%) — 캔들 보유분으로 계산. */
function pctAboveYearLow(front: StockFrontData, current: number): number | undefined {
  const lows = (front.candles ?? []).slice(-260).map((c) => c.low).filter((v) => typeof v === "number" && v > 0);
  if (lows.length < 200) return undefined;
  const low = Math.min(...lows);
  if (!(low > 0)) return undefined;
  return ((current - low) / low) * 100;
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
  subject: QuietPickSubjectSeed;
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
  /** KR DART 내부자 매수 주식수·금액(원). */
  insiderShares?: number;
  insiderValueKrw?: number;
  /** 수급 전환 신호인가(streak 이 아니라 방향 전환). */
  isReversal?: boolean;
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
    const subject: QuietPickSubjectSeed = {
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

/**
 * ① 조용한 돈 신호 — KR DART 내부자 장내매수(WO-P4 신호망 확장, 새 소스 0).
 * 임원·주요주주 특정증권등 소유상황보고서의 장내매수를 규모 하한으로 걸러 픽 후보로 올린다.
 */
function detectDartInsiderSignals(
  vocab: readonly StockDef[],
  hits: Record<string, DartDisclosureHit>,
  today: string
): SignalCandidate[] {
  const byCanonical = new Map(vocab.map((def) => [def.canonical, def]));
  const out: SignalCandidate[] = [];
  for (const [canonical, hit] of Object.entries(hits)) {
    const def = byCanonical.get(canonical);
    const purchase = hit.insiderPurchase;
    if (!def?.naverCode || def.marquee || !purchase) continue;
    const value = purchase.value;
    const shares = purchase.shares;
    if (!value && !shares) continue; // 규모 미상 신고는 후보에서 제외(가짜 수치 금지)
    if (typeof value === "number" && value < DART_INSIDER_MIN_VALUE) continue;
    const startedAt = purchase.transactionDate || hit.asOf;
    out.push({
      subject: {
        canonical,
        symbol: def.naverCode,
        naverCode: def.naverCode,
        market: def.market,
        country: "KR",
      },
      kind: "insider_cluster",
      code: "insider_cluster",
      actorNoun: "내부자",
      actors: purchase.ownerRole || "임원·주요주주",
      scale: typeof value === "number" ? formatWon(value) : formatShares(shares ?? 0),
      days: Math.max(1, daysBetween(startedAt, today)),
      startedAt,
      baseStrength: 210 + (typeof value === "number" ? Math.log10(Math.max(1, value)) * 4 : 0),
      attentionKey: canonical,
      ...(typeof shares === "number" ? { insiderShares: shares } : {}),
      ...(typeof value === "number" ? { insiderValueKrw: value } : {}),
    });
  }
  return out;
}

/**
 * ① 조용한 돈 신호 — KR 기관·외인 순매수 전환(WO-P4). 20일 누적 순매도 → 최근 3일 순매수.
 * 방향 전환은 streak 보다 이른 신호라 "아직 조용한" 구간을 더 많이 잡는다.
 */
function detectFlowReversalSignals(
  vocab: readonly StockDef[],
  histories: Record<string, InvestorFlow[]>,
  today: string
): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  for (const def of vocab) {
    if (!def.naverCode || def.marquee) continue;
    const flows = histories[def.naverCode];
    if (!flows || flows.length < REVERSAL_LOOKBACK_DAYS) continue;
    const recent = flows.slice(0, REVERSAL_CONFIRM_DAYS); // store 는 최신순
    const prior = flows.slice(REVERSAL_CONFIRM_DAYS, REVERSAL_LOOKBACK_DAYS);
    if (recent.length < REVERSAL_CONFIRM_DAYS || prior.length === 0) continue;

    for (const actor of ["foreign", "institution"] as const) {
      const pick = (flow: InvestorFlow) => (actor === "foreign" ? flow.foreignNet : flow.institutionNet);
      const recentSum = recent.reduce((sum, flow) => sum + pick(flow), 0);
      const priorSum = prior.reduce((sum, flow) => sum + pick(flow), 0);
      // 전환 = 직전 구간 순매도, 최근 3일 전부 순매수.
      if (priorSum >= 0 || recentSum <= 0) continue;
      if (!recent.every((flow) => pick(flow) > 0)) continue;
      const startedAt = recent.at(-1)?.date ?? today;
      out.push({
        subject: {
          canonical: def.canonical,
          symbol: def.naverCode,
          naverCode: def.naverCode,
          market: def.market,
          country: "KR",
        },
        kind: actor === "foreign" ? "foreign_streak" : "institution_streak",
        code: actor === "foreign" ? "foreign_streak" : "institution_streak",
        actorNoun: actor === "foreign" ? "외국인" : "기관",
        actors: actor === "foreign" ? "외국인" : "기관",
        scale: formatShares(recentSum),
        days: REVERSAL_CONFIRM_DAYS,
        startedAt,
        baseStrength: 120 + Math.min(40, Math.abs(priorSum) / Math.max(1, recentSum)),
        attentionKey: def.canonical,
        streakSum: recentSum,
        isReversal: true,
        streakWindowDays: flows.length,
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

/** 어제 픽의 신호 상태(신선도·강화 판정용). */
export interface QuietPickPriorState {
  startedAt: string;
  days: number;
  insiderCount?: number;
  scale: string;
  /** 어제 규모의 실수치(US=매수금액 USD, KR=순매수 총량) — 문자열 scale 은 버킷이라 증가를 놓친다. */
  amount?: number;
}

/**
 * 신호 강화 판정(WO-P4) — 같은 신호가 더 강해졌으면 진행 상황 문구를 돌려준다(재등장 허용).
 * 변화가 없으면 undefined(순수 반복 → 픽 제외). "재탕"과 "진행 중"을 가르는 지점.
 */
/** 신호 규모의 실수치 — US 는 매수금액(USD), KR 은 창 내 순매수 총량. 없으면 undefined. */
export function signalAmount(sig: {
  valueUsd?: number;
  insiderValueKrw?: number;
  streakSum?: number;
}): number | undefined {
  const raw = sig.valueUsd ?? sig.insiderValueKrw ?? sig.streakSum;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/** 금액이 "의미 있게" 늘었다고 볼 최소 증가율 — 반올림 노이즈로 매일 재등장하지 않게. */
const AMOUNT_GROWTH_MIN = 0.05;

function strengthenedProgress(prior: QuietPickPriorState, sig: SignalCandidate): string | undefined {
  // ⓐ 신호가 새로 시작됐으면 '반복'이 아니다 — 같은 종목이어도 별개 사건(이전엔 이걸 stale 로 죽였다).
  if (sig.startedAt && prior.startedAt && sig.startedAt !== prior.startedAt) {
    return `새로 시작된 신호예요 — ${sig.days}일째 이어지는 중`;
  }

  const addedPeople = typeof sig.insiderCount === "number" && typeof prior.insiderCount === "number"
    ? sig.insiderCount - prior.insiderCount
    : 0;
  const addedDays = sig.days - prior.days;
  if (addedPeople > 0) {
    return `${sig.days}일째 계속 — 어제보다 ${addedPeople}명 늘었어요`;
  }
  if (addedDays > 0) {
    return `${sig.days}일째 계속 — 어제보다 ${addedDays}일 더 이어졌어요`;
  }

  // ⓑ 금액 증가 — 문자열 scale 은 버킷("$4.8M")이라 5.2M 로 늘어도 같은 값이 나온다. 실수치로 본다.
  const now = signalAmount(sig);
  const before = prior.amount;
  if (typeof now === "number" && typeof before === "number" && before > 0) {
    const growth = now / before - 1;
    if (growth >= AMOUNT_GROWTH_MIN) {
      return `${sig.days}일째 계속 — 규모가 ${Math.round(growth * 100)}% 더 늘었어요`;
    }
  }
  if (sig.scale !== prior.scale) {
    return `${sig.days}일째 계속 — 규모가 ${sig.scale}로 늘었어요`;
  }
  return undefined;
}

/** 같은 종목에 여러 신호가 잡히면 강도 높은 하나만 남긴다(선반 중복 노출 방지). */
function dedupeSignalsByStock(signals: readonly SignalCandidate[]): SignalCandidate[] {
  const best = new Map<string, SignalCandidate>();
  for (const sig of signals) {
    const key = `${sig.subject.country}:${sig.subject.naverCode ?? sig.subject.symbol ?? sig.subject.canonical}`;
    const prev = best.get(key);
    if (!prev || sig.baseStrength > prev.baseStrength) best.set(key, sig);
  }
  return [...best.values()];
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
  /** 어제 픽의 신호 상태(WO-P4) — 순수 반복 제외 + 강화 시 재등장 판정에 쓴다. */
  priorPicks?: ReadonlyMap<string, QuietPickPriorState>;
  limit?: number;
} = {}): Promise<QuietPickResponse> {
  const deps = { ...defaultDeps, ...options.deps };
  const date = options.date ?? kstDate();
  const limit = options.limit ?? QUIET_PICK_MAX;
  const priorPicks = options.priorPicks ?? new Map<string, QuietPickPriorState>();
  const drops: Record<string, number> = {};
  const drop = (reason: string) => { drops[reason] = (drops[reason] ?? 0) + 1; };

  // 신호 성적(WO-P2 §2) — 유형별 (원장 n≥30 ? 실전 : 백테스트). 없으면 카드가 블록을 숨긴다.
  const signalStatsMap: Partial<Record<SignalTypeCode, SignalStats>> = await readSignalStatsForCards(date).catch(
    () => ({}) as Partial<Record<SignalTypeCode, SignalStats>>
  );

  // ── 신호 검출(①) ──
  const krDefs = deps.vocab.filter((d) => d.naverCode && !d.marquee);
  const krCodes = krDefs.map((d) => d.naverCode!);
  const [histories, insiderRaw, marketRows, attention, rankMap, usRows, dartInsiders] = await Promise.all([
    deps.readSupplyDemandHistoryByTickers(krCodes, KR_STREAK_WINDOW).catch(() => ({} as Record<string, InvestorFlow[]>)),
    deps.fetchInsiderClusterCandidates().catch(() => [] as InsiderClusterCandidate[]),
    deps.fetchKrMarketRows().catch(() => [] as KrMarketRow[]),
    deps.computeStockAttentionSignals().catch(() => ({} as Record<string, StockAttentionSignal>)),
    deps.fetchMarketCapRankMap().catch(() => ({} as Awaited<ReturnType<typeof fetchMarketCapRankMap>>)),
    deps.fetchCachedUsMarketRows().catch(() => [] as KrMarketRow[]),
    deps.fetchDartInsiderPurchasesByStock(date).catch(() => ({} as Record<string, DartDisclosureHit>)),
  ]);

  const krSignals = detectKrSignals(krDefs, histories);
  const usSignals = detectUsInsiderSignals(insiderRaw, date);
  // WO-P4 신호망 확장 — KR 내부자(DART)·수급 전환. 같은 종목 중복은 강도 높은 쪽만 남긴다.
  const dartSignals = detectDartInsiderSignals(krDefs, dartInsiders, date);
  const reversalSignals = detectFlowReversalSignals(krDefs, histories, date);
  const allSignals = dedupeSignalsByStock([...krSignals, ...usSignals, ...dartSignals, ...reversalSignals]);

  // ── 아직 조용함(②) — 이제 '탈락'이 아니라 '태깅'이다(WO-P4 2단 구조).
  //    신호가 실재하는 후보는 버리지 않고 미달 사유를 달아 '지켜보는 중' 선반으로 보낸다.
  const marketByCode = new Map(marketRows.filter((r) => r.naverCode).map((r) => [r.naverCode!, r]));
  const topTurnover = tradingValueTopRanks(marketRows, TRADING_VALUE_TOP_RANK);
  // US 시총 맵(대형주 판정 + 규모 상대화). symbol → marketCapUsd.
  const usMcap = new Map<string, number>();
  for (const r of usRows) if (r.symbol && typeof r.marketCapUsd === "number") usMcap.set(r.symbol.toUpperCase(), r.marketCapUsd);

  /** 대형주 조건부 통과(WO-P4) — 이례적 규모·인원이면 대형주라도 픽. Elevance(0.0016%)는 여전히 탈락. */
  const megaCapPasses = (sig: SignalCandidate, cap: number | undefined): boolean => {
    if (typeof sig.insiderCount === "number" && sig.insiderCount >= MEGA_CAP_MIN_INSIDERS) return true;
    if (cap && sig.valueUsd) return (sig.valueUsd / cap) * 100 >= MEGA_CAP_MIN_MCAP_PCT;
    // KR 대형주는 다중 주체(외인+기관 동시)만 이례성으로 인정.
    return sig.kind === "multi_cluster";
  };

  const tagged = allSignals.map((sig) => {
    const mention = attention[sig.attentionKey]?.mentionScore ?? 0;
    let near: { code: QuietWatchReasonCode; text: string } | null = null;
    const row = sig.subject.naverCode ? marketByCode.get(sig.subject.naverCode) : undefined;

    if (mention > MAX_MENTION_SCORE) {
      near = { code: "mention_hot", text: "이미 뉴스에 많이 오른 종목이에요" };
    } else if (sig.subject.country === "KR") {
      const changePct = row?.changePct;
      const tradingValue = row?.tradingValue;
      const rank = sig.subject.naverCode ? rankMap[sig.subject.naverCode]?.rank : undefined;
      if (typeof changePct === "number" && Math.abs(changePct) >= MAX_ABS_CHANGE_PCT) {
        near = { code: "changed_15", text: `오늘 이미 ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% 움직였어요` };
      } else if (sig.subject.naverCode && topTurnover.has(sig.subject.naverCode)) {
        near = { code: "turnover_top20", text: "오늘 거래대금 상위권이라 이미 붐볐어요" };
      } else if (typeof rank === "number" && rank <= KR_MEGA_CAP_RANK && !megaCapPasses(sig, undefined)) {
        // 시장(코스피/코스닥)을 반드시 붙인다 — 코스닥 1위를 "시총 1위"로 읽히게 하면 오정보다.
        // rankMap.market 은 이미 한국어 라벨("코스피"/"코스닥")이므로 그대로 쓴다(값 비교 금지).
        const marketLabel = rankMap[sig.subject.naverCode!]?.market ?? "국내";
        near = { code: "mega_cap", text: `${marketLabel} 시총 ${rank}위권이라 이미 알려져 있어요` };
      } else if (typeof tradingValue === "number" && tradingValue < KR_MIN_TRADING_VALUE) {
        near = { code: "illiquid", text: `거래가 너무 얇아요 (일 ${formatWon(tradingValue)})` };
      }
    } else {
      const cap = sig.subject.symbol ? usMcap.get(sig.subject.symbol.toUpperCase()) : undefined;
      if (typeof cap === "number" && cap > US_MEGA_CAP_USD && !megaCapPasses(sig, cap)) {
        near = { code: "mega_cap", text: "이미 많이 알려진 대형주예요" };
      }
    }
    return { sig, near };
  });

  // 프론트 조립은 비용이 크므로 강도순 상한을 둔다(잘린 수는 로그로 남긴다).
  const ordered = [...tagged].sort((a, b) => b.sig.baseStrength - a.sig.baseStrength);
  const considered = ordered.slice(0, MAX_FRONT_ASSEMBLIES);
  if (ordered.length > considered.length) {
    console.warn("[quiet-pick] front assembly capped", { total: ordered.length, considered: considered.length });
  }
  const quietCandidates = considered;

  // ── 품질 게이트(③) + 프론트 조립(생존 후보만 — 비용 큰 단계) ──
  const assembled = await Promise.all(
    quietCandidates.map(async ({ sig, near }) => {
      try {
        const attn = attention[sig.attentionKey];
        const coverage = attn ? { attention: attn } : {};
        const front = sig.subject.country === "KR"
          ? await deps.assembleStockFront(sig.subject.canonical, rankMap, coverage, sig.subject.naverCode ? { naverCode: sig.subject.naverCode } : {})
          : await deps.assembleStockFront(sig.subject.canonical, rankMap, coverage, sig.subject.symbol ? { symbol: sig.subject.symbol } : {});
        return { sig, near, front };
      } catch {
        return { sig, near, front: null as StockFrontData | null };
      }
    })
  );

  const picks: QuietPick[] = [];
  const watching: QuietWatchItem[] = [];
  /** 신호는 실재하는데 ② 미달 — 지켜보는 중 선반으로. 품질(③) 실패는 여기 오지 않는다. */
  const sendToWatch = (
    sig: SignalCandidate,
    reason: { code: QuietWatchReasonCode; text: string },
    priceInfo?: { current?: number; currentText?: string; changePct?: number }
  ) => {
    drop(reason.code);
    watching.push({
      subject: { ...sig.subject, ...companyDisplay(sig.subject) },
      signal: { kind: sig.kind, code: sig.code, actors: sig.actors, scale: sig.scale, days: sig.days },
      ...(priceInfo ? { price: priceInfo } : {}),
      reasonCode: reason.code,
      reasonText: reason.text,
    });
  };

  for (const { sig, near, front } of assembled) {
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
    const priceInfo = {
      current,
      ...(front.priceText ? { currentText: front.priceText } : {}),
      ...(typeof changePct === "number" ? { changePct } : {}),
    };
    if (typeof changePct === "number" && Math.abs(changePct) >= MAX_ABS_CHANGE_PCT) {
      sendToWatch(sig, { code: "changed_15", text: `오늘 이미 ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% 움직였어요` }, priceInfo);
      continue;
    }

    // 유동성(KR) — 하한(3억) 미만은 지켜보는 중, 하한~10억은 픽 + "얇아요" 표기(WO-P4).
    const krTradingValue = sig.subject.country === "KR" && sig.subject.naverCode
      ? marketByCode.get(sig.subject.naverCode)?.tradingValue
      : undefined;
    if (typeof krTradingValue === "number" && krTradingValue < KR_MIN_TRADING_VALUE) {
      sendToWatch(sig, { code: "illiquid", text: `거래가 너무 얇아요 (일 ${formatWon(krTradingValue)})` }, priceInfo);
      continue;
    }

    // 사전 태깅된 ② 미달(화제성·대형주·거래대금 상위)도 여기서 선반으로 — 품질은 이미 통과했다.
    if (near) { sendToWatch(sig, near, priceInfo); continue; }

    // 신호 시작가 확정 + 누적 상승 게이트(②).
    const priceAtSignal = sig.priceAtSignal
      ?? (sig.subject.country === "KR" ? krCloseAtOrBefore(front, sig.startedAt) : null)
      ?? current;
    const cumulativePct = ((current - priceAtSignal) / priceAtSignal) * 100;
    if (cumulativePct >= MAX_CUMULATIVE_SINCE_SIGNAL_PCT) {
      // 비현실적 수치(TSM 같은 ADR/원주 통화 불일치로 445% 등)는 선반에도 올리지 않는다 —
      // 틀린 숫자를 유저에게 보여주는 게 빈 선반보다 나쁘다(가짜 수치 노출 금지).
      if (cumulativePct > IMPLAUSIBLE_CUMULATIVE_PCT) { drop("implausible_price"); continue; }
      sendToWatch(sig, { code: "ran_30_since_signal", text: `신호 후 이미 ${cumulativePct.toFixed(0)}% 올랐어요` }, priceInfo);
      continue;
    }

    // 신선도(WO-P4) — 순수 반복만 제외. 신호가 강해졌으면 진행 상황 문구와 함께 재등장한다.
    const prior = priorPicks.get(sig.subject.canonical);
    let progress: string | undefined;
    if (prior && prior.startedAt === sig.startedAt) {
      progress = strengthenedProgress(prior, sig);
      if (!progress) { drop("stale_repeat"); continue; }
      drop("repeat_strengthened"); // 탈락이 아니라 '재등장 허용' 카운터(관측용)
    }

    const score = front.score?.score ?? null;
    const timingGrade = timingGradeOf(front.verdict);
    const valuationGrade = valuationGradeOf(score);
    const zone = front.wyckoff?.currentZone;

    // ── 이례성 지표(WO-G1A2) — 보유 수치만. 하나도 없으면 후킹 없는 픽 → 발행 제외. ──
    const avgVol = avg20Volume(front);
    let volumePct: number | undefined;
    let mcapPct: number | undefined;
    if (sig.subject.country === "KR") {
      if (avgVol && sig.insiderShares) volumePct = (sig.insiderShares / avgVol) * 100;
      else if (avgVol && sig.streakSum && sig.days > 0) volumePct = ((sig.streakSum / sig.days) / avgVol) * 100;
    } else {
      const shares = sig.valueUsd && sig.buyPrice ? sig.valueUsd / sig.buyPrice : undefined;
      if (avgVol && shares) volumePct = (shares / avgVol) * 100;
      const cap = sig.subject.symbol ? usMcap.get(sig.subject.symbol.toUpperCase()) : undefined;
      if (cap && sig.valueUsd) mcapPct = (sig.valueUsd / cap) * 100;
    }
    // WO-P4 신호망 확장 — 거래량 진공·52주 저점권(캔들 보유분으로 계산).
    const vacuumRatio = volumeVacuumRatio(front);
    const aboveLow = pctAboveYearLow(front, current);

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
      ...(typeof vacuumRatio === "number" ? { volumeVacuumRatio: vacuumRatio } : {}),
      ...(typeof aboveLow === "number" ? { pctAboveYearLow: aboveLow } : {}),
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
      subject: { ...sig.subject, ...companyDisplay(sig.subject), identity },
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
        ...(typeof sig.insiderCount === "number" ? { insiderCount: sig.insiderCount } : {}),
        ...(((): { amount?: number } => {
          const amount = signalAmount(sig);
          return amount === undefined ? {} : { amount };
        })()),
        ...(progress ? { progress } : {}),
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
      ...(typeof krTradingValue === "number" && krTradingValue < KR_THIN_TRADING_VALUE
        ? { liquidityNote: `거래가 얇아요 (일 ${formatWon(krTradingValue)})` }
        : {}),
      ...(() => {
        // "이런 신호, 과거엔 어땠나" — 승률·중앙값·하락비율을 한 세트로 실어 보낸다.
        const stats = signalStatsMap[sig.code];
        const copy = buildSignalStatsCopy(stats ?? null);
        const h = stats?.horizons[30] ?? stats?.horizons[7];
        if (!stats || !copy || !h) return {};
        return {
          signalStats: {
            n: h.n,
            up: h.up,
            winRate: h.winRate,
            down: h.down,
            downRate: h.downRate,
            medianReturn: h.medianReturn,
            windowDays: stats.horizons[30] ? 30 : 7,
            sourceLabel: copy.sourceLabel,
            method: copy.method,
            headline: copy.headline,
            detail: copy.detail,
          },
        };
      })(),
      qualifiedAt: date,
    });
  }

  // ── 강도순 정렬 + 상위 N(억지 충원 금지) ──
  picks.sort((a, b) => b.signal.strength - a.signal.strength);
  const published = picks.slice(0, limit);
  // 지켜보는 중 — 미달 사유가 '기준 미달'인 것만(품질 실패는 애초에 오지 않는다). 최대 10곳.
  const watchShelf = watching.slice(0, QUIET_WATCH_MAX);

  return {
    asOf: new Date().toISOString(),
    date,
    picks: published,
    watching: watchShelf,
    qualification: {
      krUniverse: krDefs.length,
      krWithSignal: krSignals.length,
      usInsiderRaw: insiderRaw.length,
      usWithSignal: usSignals.length,
      afterQuiet: quietCandidates.length,
      afterQuality: picks.length,
      published: published.length,
      watching: watchShelf.length,
      drops,
    },
    source: "quiet-pick-engine",
  };
}

/**
 * 어제 픽 → 신호 상태 맵(WO-P4). 순수 반복 제외 + 강화 재등장 판정에 쓴다.
 * canonical 기준(같은 종목이 어제와 같은 신호를 이어가는지 본다).
 */
export function quietPickPriorState(response: QuietPickResponse | null): Map<string, QuietPickPriorState> {
  const out = new Map<string, QuietPickPriorState>();
  for (const pick of response?.picks ?? []) {
    out.set(pick.subject.canonical, {
      startedAt: pick.signal.startedAt,
      days: pick.signal.days,
      scale: pick.signal.scale,
      ...(typeof pick.signal.insiderCount === "number" ? { insiderCount: pick.signal.insiderCount } : {}),
      ...(typeof pick.signal.amount === "number" ? { amount: pick.signal.amount } : {}),
    });
  }
  return out;
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
