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
  buildQuietPickChips,
  selectCardType,
  marketDivergenceCard,
  volumeAwakeningCard,
  detectMarketDivergence,
  detectVolumeAwakening,
  probeQuietSignals,
  MARKET_DIVERGENCE_MIN_DOWN_DAYS,
  type MarketDivergence,
  type VolumeAwakening,
  normalizeQuietMoneyDate,
  type CardTypeDecision,
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
  type DailyOhlcv,
  buildWhyNowTimeline,
  whyNowQuietNote,
  earningsTurnEvent,
  type WhyNowEvent,
} from "@fomo/core";
import { kstDate } from "./fomo";
import { parsePriceText } from "./quote-prices";
import { readSupplyDemandHistoryByTickers, readSupplyDemandHistoryByTickersStrict } from "./supply-demand-store";
import { computeStockAttentionSignals, type StockAttentionSignal } from "./stock-signal-coverage";
import { fetchKrMarketRows } from "./discovery-supply";
import { buildKrPickUniverse } from "./pick-universe";
import {
  fetchInsiderClusterCandidates,
  fetchInsiderHistory,
  type InsiderClusterCandidate,
  type InsiderPurchaseRow,
} from "./insider-source";
import { fetchCachedUsMarketRows } from "./us-market-source";
import { usDiscoverySeedForSymbol } from "./us-symbols";
import { fetchDartInsiderPurchasesByStock, type DartDisclosureHit } from "./dart-disclosures";
import { writeUsCandleCache } from "./us-candle-cache";
import { assembleStockFront, fetchMarketCapRankMap, type StockFrontData, fetchStockDaily } from "./stock-front";
import { assetForStock, ledgerKey, scoreBand, type LedgerAppendInput } from "./judgment-ledger";
import { readSignalStatsForCards } from "./signal-stats";
import { readDisclosureCollection } from "./disclosure-store";
import { readAllFactSheets } from "./fundamentals/repository";
import { readKrCandleCacheMany } from "./kr-candle-cache";
import type { DisclosureCollection } from "./disclosure-collect";
import {
  rankScore as deckRankScore,
  noveltyScore,
  composeDeck,
  isAgedOut,
  isFreshSignal,
  page1StreakFromHistory,
  PAGE1_SIZE,
  type DeckSkipReason,
} from "./deck-ranking";
import type { PublicationStamp } from "./publication-stamp";

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
/**
 * 하루 덱 상한.
 *
 * WO-RESET-03 E-1 — **신호가 나오는 만큼, 15장이 넘으면 강한 순으로 15장까지.**
 * 15장이 안 되면 되는 만큼만 낸다(억지로 채우지 않는다 — 그건 이 제품이 하지 않는 일이다).
 * 종전 10 은 카드 종류가 하나뿐이던 시절의 값이다.
 */
export const QUIET_PICK_MAX = 15;

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
  /**
   * 시총 표기 — "시총 $13B". **마스킹된 앞면에 남기는 판단 재료다**(WO-HOOK-01 §2-2):
   * 이름을 가리면서 규모감까지 없애면 낚시가 되고 판단 재료가 0 이 된다.
   *
   * 확보된 시장만 채운다. KR 은 현재 시총 **순위**만 있고 금액이 없어(`fetchMarketCapRankMap`)
   * 비운다 — 없는 값의 자리를 만들지 않는다(DS-00 §1-1).
   */
  marketCapText?: string;
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
  /** "임원 3명" / "기관" / "외국인" / "외국인·기관" — 실주체. */
  actors: string;
  /** "$4.6M" / "27만주" — 실공시 수치만. */
  scale: string;
  /** 지속·윈도우 일수. */
  days: number;
  /** 신호 시작 시점 가격(박제). */
  priceAtSignal: number;
  /** 신호 시작일(YYYY-MM-DD). */
  startedAt: string;
  /**
   * 신호 강도(규모·인원 기반 — 다중 > 내부자 > 단일 streak). **화면 순위가 아니다.**
   * 순위는 `rankScore`(신규성 1차 축) 가 만든다 — `rankScore` 필드를 본다.
   */
  strength: number;
  /**
   * 화면 순위 점수(WO-DECK-01) — `신규성 × 재노출 쿨다운 × 이례성`. 연속일수는 들어가지 않는다.
   * 이 값이 곧 덱 정렬 키이므로 나중에 "왜 이 순서인가" 를 되물을 때 인용할 수 있어야 한다.
   */
  rankScore: number;
  /**
   * 경과일 시계의 기준일(YYYY-MM-DD). 기본은 `startedAt`, 재등장 사유가 생기면 그 날로 리셋된다.
   * 26일째 신호가 새 재료로 되살아났을 때 26일 누적으로 계속 눌려 있지 않게 하는 장치다.
   */
  ageAnchor?: string;
  /** 유효 경과일 — `ageAnchor` 기준. 신규성·구성 규칙이 전부 이 값을 본다(`days` 가 아니다). */
  ageDays: number;
  /** 어제까지 1페이지에 연속으로 있던 일수(쿨다운 입력). 0 이면 감점 없음. */
  page1Streak?: number;
  /** 내부자 인원(US 클러스터) — 강화 재등장 판정에 쓴다. */
  insiderCount?: number;
  /**
   * 신호 규모의 실수치(US=매수금액 USD, KR=순매수 총량). 화면에 직접 쓰진 않지만
   * **내일 재등장 판정의 기준**이 된다(scale 문자열은 버킷이라 5% 증가를 못 본다).
   */
  amount?: number;
  /**
   * 신호 강화 재등장 문구(WO-P4) — 어제 픽과 같은 신호가 **더 강해졌을 때만** 채운다.
   * 예 "5일째 계속 — 어제보다 2명 늘었어요".
   *
   * ⛔ "어제보다 1일 더 이어졌어요" 는 여기 오지 않는다(WO-DECK-01 §3-2) — 그건 변화가 아니라 지속이다.
   * 순수 반복은 이제 **제외가 아니라 강등**이다(쿨다운·감쇠가 처리한다).
   */
  progress?: string;
  /**
   * 재등장 사유(WO-DECK-01 §3-2) — 경과일 상한을 넘었거나 쿨다운이 걸린 종목이 **그럼에도** 다시
   * 올라온 이유. 카드에 표시한다. 사유가 없으면 필드 자체가 없다(빈 껍데기 금지).
   */
  reentry?: QuietPickReentry;
}

/** 재등장 사유 코드(WO-DECK-01 §3-2). 지속(하루 더 이어짐)은 사유가 아니다. */
export type QuietPickReentryCode =
  | "invalidation_break"
  | "new_material"
  | "actor_joined"
  | "structure_shift";

export interface QuietPickReentry {
  code: QuietPickReentryCode;
  /** 유저어 한 줄 — 카드에 그대로 실린다. */
  text: string;
  /** 사유 발생일(YYYY-MM-DD) — 경과일 시계를 여기로 리셋한다. */
  occurredAt: string;
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

/**
 * 훅과 디테일이 같은 사실에 다른 숫자를 달지 않게 맞춘다 (WO-SYNC F-1).
 *
 * 문제: 훅의 연속일수는 픽 엔진의 `signal.days` 인데, 디테일 문장(`front.wyckoff.summary`)은
 * **다른 파이프라인**(verdict 의 `institutionNetStreak`)에서 자기 숫자를 따로 만든다. 그래서
 * 2026-08-15 발행분에서 `institution_streak` 카드 2장 **모두** 어긋났다 — 26 vs 20, 6 vs 4.
 * 같은 화면에 두 숫자가 붙으면 사용자는 둘 다 믿지 않는다.
 *
 * 정본은 `signal.days` 다: 빅텍은 `startedAt 2026-07-09` → 발행일까지 약 26거래일로
 * `signal.days=26` 과 맞고, 디테일의 20 이 뒤처진 값이었다. 훅·칩·`progress`·판단 원장이
 * 전부 이 값을 쓰므로 축도 여기로 모은다.
 *
 * **같은 주체의 연속일수 주장일 때만** 숫자를 맞춘다. 훅이 임원(내부자)을 말하는 카드에서
 * 디테일이 기관 수급을 말하는 것은 서로 다른 사실이므로 건드리지 않는다.
 */
export function reconcileStreakClaim(summary: string, actors: string, days: number): string {
  if (!Number.isFinite(days) || days <= 0) return summary;
  return summary.replace(/(외국인|기관)(\s*)(\d+)(일\s*연속)/g, (whole, actor: string, gap: string, stated: string, tail: string) =>
    actors.includes(actor) && Number(stated) !== days ? `${actor}${gap}${days}${tail}` : whole
  );
}

/**
 * 발행 시점 이례성 원료의 **실수치** (WO-SYNC F-2).
 *
 * 엔진은 `volumeVacuumRatio` · `pctAboveYearLow` · `volumePct` 를 실제로 계산하는데, 종전에는
 * 그 값이 문장으로만 남고("거래가 평소의 30%로 말라 있었어요") **숫자가 사라졌다.**
 * 2026-08-16 실사에서 발행 10장의 `anomalies` 수치 필드가 0개인 것이 확인됐다.
 *
 * 신규 수집 없이 회수 가능한 값이라 발행 시점에 그대로 박제한다. 카드가 문장을 되파싱하지
 * 않아도 되고, 판단 원장에 같이 들어가 **사후 채점**이 가능해진다.
 *
 * `kind`·`actorNoun`·`scale`·`days` 는 이미 `signal` 에 있으므로 중복 저장하지 않는다.
 */
export type QuietPickSignalFacts = Omit<QuietPickAnomalyFacts, "kind" | "actorNoun" | "scale" | "days">;

export interface QuietPick {
  subject: QuietPickSubject;
  price: { current: number; currentText?: string; changePct?: number; sparkline: number[] };
  signal: QuietPickSignal;
  /**
   * 훅 — **무슨 일이 일어났나 한 문장**(WO-SUB-HOOK PART 1). 이례성은 훅이 아니라 칩이 말한다.
   */
  hook: string;
  /**
   * 카드 칩 — 훅이 말하지 않는 근거만 서로 다른 축으로 최대 3개(WO-SUB-HOOK PART 1).
   * 카드가 조립하지 않는다. 같은 사실이 화면에서 두 벌 만들어지는 것을 막으려면 발행 시점에 굳혀야 한다.
   */
  chips: string[];
  /** 이례성 지표(칩 원료·디테일 "왜 지금인가") — 최소 1개(0개면 발행 안 함). 강도 내림차순. */
  anomalies: QuietPickAnomaly[];
  /** 위 문장들의 원료 실수치(WO-SYNC F-2). 확보된 값만 실린다 — 미상 필드는 아예 없다. */
  signalFacts?: QuietPickSignalFacts;
  invalidation: QuietPickInvalidation;
  conviction: QuietPickConviction;
  /** 종합점수(내부화 — 화면 노출 아님, 픽 근거·성적표 밴드용). */
  companyScore: number | null;
  /**
   * 카드 3형(WO-HOOK-01) — **신호가 고른 형**과 그 형의 후킹·그림 재료.
   *
   * 세 형 중 어느 것도 성립하지 않는 종목은 애초에 픽이 되지 않으므로(`no_card_type` 로 탈락)
   * 발행된 픽에는 항상 있다. 구 페이로드에는 없으므로 선택 필드로 두고, 없으면 카드가
   * 종전 훅으로 그린다(배치 시차 동안의 폴백).
   */
  cardType?: CardTypeDecision;
  /** 데이터 완결성 게이트 로그(WO-P1). */
  dataQuality: QuietPickDataQuality;
  /** 유동성 경고(WO-P4) — 하한은 넘었지만 얇은 종목. 숨기지 않고 카드에 표기한다. */
  liquidityNote?: string;
  /**
   * 이 신호의 과거 성적(WO-P2 §2) — 승률·중앙값·하락비율 세트. 카드가 "무조건 오르나?"에 답하는 근거.
   * 통계가 없는 유형이면 필드 자체가 없다 → 카드는 블록을 통째로 숨긴다(빈 껍데기 금지).
   */
  signalStats?: SignalStatsCard;
  /**
   * 「왜 지금 사는가」 타임라인 (WO-RESET-02 PART C) — **굽는 시점에 만든다.**
   *
   * 화면이 열릴 때 공시를 가져오지 않는다(A-3). 여기 실려 오는 것이 화면이 그리는 전부다.
   * 날짜 붙은 항목이 하나도 없으면 **빈 배열**이고, 그때 화면은 섹션을 통째로 안 그린다(C-3).
   */
  whyNow?: WhyNowEvent[];
  /** 공시가 0건일 때 붙이는 줄(C-4). 수집 전이면 `undefined` — "없었다" 와 "안 봤다" 는 다르다. */
  whyNowQuietNote?: string;
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
  | "turnover_top20"
  /** 경과일 상한 초과 — 신규 신호가 아니므로 픽에서 워치로(WO-DECK-01 §2-4). 영구 배제 아님. */
  | "signal_aged"
  /** 픽 자격은 갖췄으나 구성 규칙(동일 유형 상한·지속 상한)에 밀렸다(WO-DECK-01 §4). */
  | "composition_overflow";

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
  /**
   * WO-RESET-04 PART D — 유니버스를 무엇으로 만들었나.
   * `market` = 시세 행(정상) · `vocab` = 시세가 비어 사전으로 후퇴(장애 신호).
   * 구 페이로드에는 없다.
   */
  krUniverseSource?: "market" | "vocab";
  /** 사전 밖에서 새로 들어온 종목 수 — 확대가 실제로 먹었는지 보는 값. */
  krUniverseFromRows?: number;
  /** 사전에 이미 있던 종목 수. */
  krUniverseFromVocab?: number;
  krWithSignal: number;
  usInsiderRaw: number;
  usWithSignal: number;
  afterQuiet: number;
  afterQuality: number;
  published: number;
  /** 지켜보는 중 선반 노출 수(WO-P4). */
  watching: number;
  drops: Record<string, number>;
  /**
   * 이번 빌드에서 **예외로 실패한** 입력 소스 이름(성공·정상 공백은 여기 없다).
   *
   * 왜 필요한가: 모든 입력이 fail-open 이라 실패해도 빈 값으로 대체되고, 그러면
   * `krWithSignal: 0 / published: 0` 이 "조용한 날" 과 글자 하나 다르지 않다. 이 배열이
   * 그 둘을 가른다 — 비어 있으면 진짜로 신호가 없는 날이고, 이름이 있으면 장애다.
   * 구 페이로드에는 없으므로 읽는 쪽은 `?? []` 로 받는다.
   */
  inputFailures: string[];
  /** WO-RESET-03 — 가격·거래량 신호 계수기(진단). 유니버스·캐시·검출 건수. */
  priceSignals?: Record<string, number>;
}

/**
 * 회전율 계측(WO-DECK-01 PHASE 5) — **발행 시점에 굳힌다.**
 * 나중에 재계산하면 그날의 1페이지 이력이 이미 바뀌어 있어 같은 값이 나오지 않는다.
 */
export interface QuietPickRotation {
  /** 구성 규칙 버전(완료조건 7). 규칙이 바뀌면 값이 바뀐다. */
  compositionVersion: string;
  /** 실제 발행 장수(상한이 아니라 결과 — 신규 부족으로 줄었을 수 있다). */
  deckSize: number;
  /** 실제 덱 크기 기준 하한·상한. */
  caps: { minFresh: number; maxSameKind: number; maxPersistent: number };
  freshCount: number;
  persistentCount: number;
  promotedFromWatch: number;
  /** 신규 하한을 못 채워 줄인 장수. 0 이면 상한대로 찼다. */
  shrunkBy: number;
  compositionSkipped: Record<string, number>;
  /** 경과일 상한으로 워치로 내려간 수. */
  agedOut: number;
  /** 1페이지 쿨다운이 실제로 걸린 픽 수(연속 3일 이상). */
  cooldownApplied: number;
  /** 재등장 사유를 달고 올라온 픽 수. */
  reentryCount: number;
  /** 오늘 1페이지 종목(1~3위). */
  page1: string[];
  /** 그중 어제까지도 1페이지였던 종목과 연속일수 — 이 배열이 비어야 "매일 바뀐다". */
  page1HeldOver: Array<{ canonical: string; consecutiveDays: number }>;
  ageDaysMedian: number | null;
}

export interface QuietPickResponse {
  asOf: string;
  date: string;
  picks: QuietPick[];
  /** 2단 구조 하단 선반(WO-P4) — 신호 있으나 픽 기준 미달. 픽 승격 아님. */
  watching: QuietWatchItem[];
  /** 회전율 계측(WO-DECK-01 PHASE 5). 구 페이로드에는 없으므로 선택 필드. */
  rotation?: QuietPickRotation;
  qualification: QuietPickQualification;
  source: string;
}

// ── 발행 가드(fail-closed) ─────────────────────────────────────────────────
/**
 * 실패했을 때 **발행을 막아야 하는** 입력.
 *
 * KR 수급 이력은 KR 신호 전량의 연료다 — 이것이 실패하면 `krWithSignal` 은 구조적으로 0 이
 * 되고, 남는 US 신호만으로 만든 덱은 그날의 덱이 아니라 반쪽이다. 나머지 입력(관심도·시총
 * 랭킹·DART 등)은 보강이라 실패해도 덱의 의미가 유지되므로 여기 넣지 않는다.
 */
export const QUIET_PICK_REQUIRED_INPUTS: readonly string[] = ["readSupplyDemandHistoryByTickers"];

/**
 * 직전 발행 대비 이 비율 미만으로 줄면 붕괴로 본다(0.5 = 반토막).
 *
 * ## 실측으로 고른 값
 *
 * `docs/audit/deck_stagnation_raw.json` 의 14일(2026-08-05~18) `published` 는 **매일 10장**
 * — 상한(`QUIET_PICK_MAX`)에 붙어 있고 한 번도 흔들리지 않았다. 즉 정상 운영에서 반토막은
 * 관측된 적이 없으므로 이 하한이 평상 회전을 오판할 위험은 사실상 없다.
 *
 * 반대 방향의 비용도 고려했다: 오차단은 그날 덱이 안 바뀌고 잡이 실패하는 것으로, 사람이
 * 보게 된다. 반쪽 덱이 조용히 나가는 것은 아무도 못 본다. 후자가 더 비싸다.
 */
export const QUIET_PICK_COLLAPSE_RATIO = 0.5;

/**
 * 붕괴 판정을 적용할 직전 장수 하한.
 *
 * 직전이 2장이었다면 1장은 정상 변동일 수 있다 — 작은 수에 비율을 적용하면 평소 회전을
 * 사고로 오판한다. 상한(10장)의 절반인 4장부터 비율을 본다.
 */
export const QUIET_PICK_COLLAPSE_MIN_PRIOR = 4;

/**
 * 발행 차단 사유(없으면 null) — **쓰기 직전에** 부른다.
 *
 * ## 왜 쓰기 직전인가 (2026-08-23 사고, `docs/STATUS.md` §12)
 *
 * 종전 검증은 `vercel-production-deploy.yml` 의 **쓴 뒤** 스텝에 있었다. 그래서 커넥션 풀이
 * 마른 날 `picks: 0` 페이로드가 먼저 정규 도메인에 발행되고, 그 다음에 워크플로가 실패를
 * 알렸다 — 잡은 붉게 표시됐지만 사용자는 이미 2분간 빈 덱을 봤다. 검증이 쓰기보다 늦으면
 * 그것은 가드가 아니라 사후 보고다.
 *
 * 직전 페이로드를 남겨두는 쪽이 항상 낫다. 하루 묵은 덱은 `asOf` 로 정직하게 표시되지만,
 * 빈 덱은 AGENTS.md 자동 실패 목록에 오른 회귀다.
 *
 * ## 세 가지 차단 조건
 *
 * | 조건 | 왜 |
 * |---|---|
 * | 필수 입력 실패 | 신호가 없는 게 아니라 신호를 **읽지 못한** 것이다 |
 * | 0장 | 빈 덱은 어떤 이유로도 발행하지 않는다 |
 * | 직전 대비 반토막 | 0장은 아니지만 조용히 반쪽 덱을 내보내는 경로를 막는다 |
 *
 * `prior` 는 직전 `quiet-pick:active` 다. 같은 날 재생성이면 그것이 곧 오늘 아침의 발행분이라
 * 기준선으로 그대로 쓴다(재생성이 장수를 반토막 내면 그것도 사고다).
 */
export function quietPickPublishBlockReason(
  next: Pick<QuietPickResponse, "picks" | "qualification">,
  prior: Pick<QuietPickResponse, "picks"> | null
): string | null {
  const failed = (next.qualification.inputFailures ?? []).filter((name) =>
    QUIET_PICK_REQUIRED_INPUTS.includes(name)
  );
  if (failed.length > 0) {
    return `필수 입력 실패(${failed.join(", ")}) — 신호 없음이 아니라 읽지 못함이다`;
  }

  const count = next.picks.length;
  if (count === 0) return "재생성 결과가 0장 — 빈 덱은 발행하지 않는다";

  const priorCount = prior?.picks.length ?? 0;
  if (priorCount >= QUIET_PICK_COLLAPSE_MIN_PRIOR && count < priorCount * QUIET_PICK_COLLAPSE_RATIO) {
    return `직전 ${priorCount}장 → ${count}장 붕괴(하한 ${QUIET_PICK_COLLAPSE_RATIO * 100}%) — 직전 페이로드를 유지한다`;
  }

  return null;
}

// ── 주입 가능한 의존성(단위 테스트용 — 기본은 실 소스) ──────────────────────
export interface QuietPickDeps {
  vocab: readonly StockDef[];
  fetchKrMarketRows: typeof fetchKrMarketRows;
  readSupplyDemandHistoryByTickers: typeof readSupplyDemandHistoryByTickers;
  computeStockAttentionSignals: typeof computeStockAttentionSignals;
  fetchInsiderClusterCandidates: typeof fetchInsiderClusterCandidates;
  /** 12개월 내부자 매수 이력 — 건수(빈도)와 행(A형 누적선)을 한 번에. */
  fetchInsiderHistory: typeof fetchInsiderHistory;
  fetchCachedUsMarketRows: typeof fetchCachedUsMarketRows;
  fetchMarketCapRankMap: typeof fetchMarketCapRankMap;
  assembleStockFront: typeof assembleStockFront;
  /** 픽 시점 캔들 봉인(WO-P1) — 병합 후 확보된 길이를 돌려준다. */
  writeUsCandleCache: typeof writeUsCandleCache;
  /** KR 내부자 장내매수 공시(WO-P4 신호망 확장). */
  fetchDartInsiderPurchasesByStock: typeof fetchDartInsiderPurchasesByStock;
  /**
   * 미리 모아둔 공시(WO-RESET-02 A-3). **여기서 수집하지 않는다** — 읽기만 한다.
   * 수집은 `cron/disclosures` 가 하고, 그게 아직 안 돌았으면 `null` 이다.
   */
  readDisclosureCollection: typeof readDisclosureCollection;
  /**
   * 실적 전환 재료(WO-RESET-02 PART B). 팩트시트는 별도 파이프라인이 이미 굽는다 —
   * 여기서는 **읽기만** 한다. 한 번에 전부 읽어 종목별로 나눠 쓴다(행별 병렬 읽기 금지 — §12).
   */
  readAllFactSheets: typeof readAllFactSheets;
  /** WO-RESET-03 — 프리웜이 채운 KR 일봉을 **한 쿼리로** 읽는다(§12: 병렬 읽기 금지). */
  readKrCandleCacheMany: typeof readKrCandleCacheMany;
  /** 지수 일봉 — 시장 역행 판정의 비교 대상. */
  fetchStockDaily: typeof fetchStockDaily;
}

const defaultDeps: QuietPickDeps = {
  vocab: STOCK_VOCAB,
  fetchKrMarketRows,
  // **strict** 를 쓴다 — 삼킨 `{}` 는 "조용한 날" 과 구별되지 않고, 그 구별 실패가
  // 2026-08-23 빈 덱 발행의 첫 도미노였다(`docs/STATUS.md` §12). 아래 `guardedInput` 이
  // 예외를 잡아 `qualification.inputFailures` 에 남기고, 발행 가드가 그것을 보고 멈춘다.
  readSupplyDemandHistoryByTickers: readSupplyDemandHistoryByTickersStrict,
  computeStockAttentionSignals,
  fetchInsiderClusterCandidates,
  fetchInsiderHistory,
  fetchCachedUsMarketRows,
  fetchMarketCapRankMap,
  assembleStockFront,
  writeUsCandleCache,
  fetchDartInsiderPurchasesByStock,
  readDisclosureCollection,
  readAllFactSheets,
  readKrCandleCacheMany,
  fetchStockDaily,
};

// ── 수치 포매터(실측만) ────────────────────────────────────────────────
/**
 * 순매수 주식수 표기 (WO-SUB-HOOK D9 · 4-3).
 *
 * ## 실측 확인
 *
 * `기관 74주`(빅텍)와 `47만주`(한미반도체)가 한 화면에 섞여 단위 규칙이 없어 보였다.
 * 확인 결과 **데이터 오류가 아니다** — 소스(네이버 금융 일별 투자자 순매매, KRX 확정치 재공개)의
 * 순매매 컬럼은 **주식 수**이고(`packages/fomo-core/src/supply-demand.ts`), 74주는 25거래일
 * 누적 순매수 실값이다. 소형주에서 기관 순매수가 낱주 단위로 찍히는 것은 정상이다.
 *
 * 따라서 규칙만 하나로 고정한다: **1만주 이상은 `만주`로 반올림, 미만은 낱주를 그대로 쓴다.**
 * 낱주를 억지로 `0만주`로 올리거나 만주를 낱주로 펴지 않는다 — 둘 다 없는 정밀도를 만든다.
 *
 * (규모가 작은 신호를 어떻게 다룰지는 별건이다. 표기 규칙이 신호 임계를 대신할 수 없다.)
 */
export function formatShares(shares: number): string {
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

/** 시총 축약 — "$13B" / "$820M". 카드 ① 줄에 들어가야 하므로 유효숫자 2~3자리로 자른다. */
function formatMarketCapUsd(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)}B`;
  if (value >= 1e6) return `$${Math.round(value / 1e6)}M`;
  return `$${Math.round(value / 1e3)}K`;
}

/**
 * openinsider 영문 산업명(SIC 계열) → 짧은 한국어. WO-P1: **영문 원문 축약 노출 금지**
 * ("Computer Processing & Da" 같은 잘린 영문이 카드에 뜨던 회귀). 매칭 실패 시 한국어 폴백.
 */
/**
 * 벤더 산업명(SIC 계열) → 한국어 섹터. **순서가 규칙이다** — 위에서부터 첫 일치를 쓴다.
 * 구체적인 분류를 앞에 둔다(신발 > 화학, 방산 > 전기·전자).
 * 매핑 정본이자 감사 대상이므로 export 한다(DS-05 §4-1).
 */
export const INDUSTRY_KO: ReadonlyArray<[RegExp, string]> = [
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
  /**
   * **순서가 의미를 만든다.** SIC `Rubber & Plastics Footwear`(On Holding 등 신발 회사)가
   * `plastics` 에 먼저 걸려 `화학` 으로 분류됐다(DS-05 §4 실측 결함). 더 구체적인 분류를
   * 앞에 둔다 — 신발·의류가 화학보다 먼저다.
   */
  [/footwear|apparel|textile|leather|shoe/i, "의류·섬유"],
  [/chemical|plastics|paint|adhesive|industrial gas|fertilizer/i, "화학"],
  [/steel|metal|iron|aluminum|fabricated/i, "철강·금속"],
  [/paper|pulp|printing|publishing|newspaper/i, "제지·인쇄"],
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

const HANGUL = /[가-힣]/;

/**
 * 회사 섹터 한 줄 — **신뢰할 수 있는 소스만 쓴다**(DS-05 §4).
 *
 * ## 왜 바뀌었나
 *
 * 종전 1순위는 `front.signals.themeLabel` 이었다. 그건 회사의 섹터가 아니라 **오늘 이 종목이
 * 묶인 테마**(코인 테마·환율 테마…)다. 그래서 실측에서
 *   한화투자증권(증권사) → `코인` · On Holding(스포츠화) → `화학`
 * 이 나왔다. **섹터가 틀리면 나머지 전부를 못 믿는다** — "AI가 지어낸 얘기 같다"의 직접 원인이다.
 *
 * ## 신뢰 순서
 *
 * 1. KR: `sectorOf(canonical)` — 큐레이션 사전(방산·2차전지·반도체…)
 * 2. US: 발굴 시드의 `sector` — 큐레이션 값
 * 3. 벤더 산업분류(`industry`) → `INDUSTRY_KO` 매핑 — 소스가 분명한 산업명
 * 4. 그 외 → **빈 문자열.** `기타 업종`·`미국주식` 같은 폴백은 섹터가 아니다.
 *    화면은 빈 값이면 섹터를 그리지 않는다(시총만으로도 규모는 전달된다).
 */
/** 산업명 → 섹터. 매핑이 없으면 `undefined` — 폴백 라벨을 만들지 않는다(DS-05 §4). */
export function sectorFromIndustry(industry: string | undefined | null): string | undefined {
  const value = industry?.trim();
  if (!value) return undefined;
  for (const [pattern, ko] of INDUSTRY_KO) if (pattern.test(value)) return ko;
  return undefined;
}

/**
 * 섹터로 쓸 수 없는 라벨 — **자산군·테마다.** KR 사전(`sectorOf`)은 큐레이션이지만 테마 풀도
 * 겸해서, 코인 관련 사업을 하는 증권사가 `코인` 으로 나온다(실측: 한화투자증권). 회사의 업종이
 * 아니므로 섹터 자리에서 뺀다 — 화면은 섹터 줄을 그리지 않는다(DS-05 §4).
 */
const NON_SECTOR_LABELS = new Set(["코인", "비트코인", "가상자산", "환율", "금리", "유가", "지수"]);

function companyIdentity(front: StockFrontData, sig: SignalCandidate): string {
  // 테마 라벨은 섹터가 아니다 — 여기서 쓰지 않는다(front 는 다른 신호에 계속 쓰인다).
  void front;
  const krSector = sig.subject.country === "KR" ? sectorOf(sig.subject.canonical) : undefined;
  if (krSector && !NON_SECTOR_LABELS.has(krSector)) return krSector;
  const seedSector = sig.subject.symbol ? usDiscoverySeedForSymbol(sig.subject.symbol)?.sector?.trim() : undefined;
  if (seedSector && HANGUL.test(seedSector)) return seedSector.slice(0, 20);
  return sectorFromIndustry(sig.industry) ?? "";
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

// ── WO-HOOK-01 카드 3형 재료 ───────────────────────────────────────────────
//
// 세 형이 요구하는 데이터가 서로 다르다(WO §1). 여기서 만드는 것은 **그림의 원계열**이고,
// 정규화·렌더는 화면이 한다. 재료가 없으면 그 형을 만들지 않고 다음 형으로 넘어간다 —
// 억지로 채우면 "A형 누적 데이터 없이 억지 구현"(WO §11 실패 모드)이 된다.

/** A·C형 창 — KR 수급 조회 창과 같은 40거래일. 막대 40개면 320px 에서 각 4~5px(WO §6-2). */
const CARD_WINDOW_DAYS = KR_STREAK_WINDOW;
/** 임원 A형 누적선 창(거래일) — 임원 매수는 드물어 짧게 자르면 계단이 창 밖으로 나간다. */
const INSIDER_DIVERGENCE_WINDOW = 90;

/**
 * 신호 종류별로 누적할 순매수 축. 다중 주체는 둘을 합친다.
 *
 * `insider_cluster` 는 여기 오지 않는다 — 임원 매수에는 일별 수급 계열이 없고, 기관 계열을
 * 대신 그리면 범례("임원 매수 누적")와 선이 다른 사실을 말하게 된다. 임원 신호의 누적선은
 * `insiderDivergenceSeries` 가 공시 금액으로 만든다.
 */
function flowNetFor(flow: InvestorFlow, kind: Exclude<QuietPickSignalKind, "insider_cluster">): number {
  if (kind === "foreign_streak") return flow.foreignNet;
  if (kind === "institution_streak") return flow.institutionNet;
  return flow.foreignNet + flow.institutionNet;
}

/** 수급 계열을 가진 신호인가 — 임원 매수만 아니다. */
function isFlowKind(kind: QuietPickSignalKind): kind is Exclude<QuietPickSignalKind, "insider_cluster"> {
  return kind !== "insider_cluster";
}

/** 캔들 date(YYYYMMDD 또는 YYYY-MM-DD) → YYYY-MM-DD 종가 맵. */
function closesByDate(front: StockFrontData): Map<string, number> {
  const out = new Map<string, number>();
  for (const candle of front.candles ?? []) {
    const date = normalizeQuietMoneyDate(candle.date);
    if (date && Number.isFinite(candle.close) && candle.close > 0) out.set(date, candle.close);
  }
  return out;
}

/**
 * 수급 A형 재료 — 창 안 **누적 순매수**와 같은 날짜의 종가를 나란히 만든다.
 *
 * 누적은 순매수(매수-매도)를 쌓는다. 매수만 쌓으면 판 날을 지워 항상 우상향하는 선이 되고,
 * 그건 "안에서는 사고 있다"가 아니라 "우리가 그렇게 그렸다"가 된다.
 *
 * `flows` 는 최신순으로 온다 — 오래된 날 → 최근 날로 뒤집어 쓴다.
 */
function flowDivergenceSeries(
  front: StockFrontData,
  flows: readonly InvestorFlow[],
  kind: Exclude<QuietPickSignalKind, "insider_cluster">
): { priceSeries: number[]; buySeries: number[] } | undefined {
  const closes = closesByDate(front);
  const ordered = [...flows].reverse().slice(-CARD_WINDOW_DAYS);
  const priceSeries: number[] = [];
  const buySeries: number[] = [];
  let cumulative = 0;
  for (const flow of ordered) {
    const date = normalizeQuietMoneyDate(flow.date);
    const close = date ? closes.get(date) : undefined;
    cumulative += flowNetFor(flow, kind);
    // 종가가 없는 날(수급은 있는데 캔들이 비는 경우)은 **두 계열 모두** 건너뛴다 —
    // 한쪽만 넣으면 두 선의 x축이 어긋나 갭이 거짓이 된다.
    if (typeof close !== "number") continue;
    priceSeries.push(close);
    buySeries.push(cumulative);
  }
  if (priceSeries.length === 0) return undefined;
  return { priceSeries, buySeries };
}

/** 임원 매수 1건 — 날짜와 금액. 통화는 섞지 않는다(한 종목 안에서는 항상 같은 통화다). */
interface InsiderBuyEvent { date: string; value: number }

/**
 * 임원 A형 재료 — 매수 **금액**을 날짜별로 누적하고 같은 거래일의 종가를 나란히 만든다.
 * 매수가 없는 날은 직전 누적을 유지한다(계단). 금액을 못 읽은 건은 버린다 — 0 으로 세지 않는다.
 *
 * 계단이 하나뿐인 것은 정상이다. 미국 클러스터는 같은 날 여러 임원이 사고, KR DART 는 공시
 * 1건이 곧 사건 1건이다. 한 계단이라도 **주가가 그 뒤로 안 오르면** 갭은 보인다.
 */
function insiderDivergenceSeries(
  front: StockFrontData,
  events: readonly InsiderBuyEvent[]
): { priceSeries: number[]; buySeries: number[] } | undefined {
  const byDate = new Map<string, number>();
  for (const event of events) {
    if (!(event.value > 0)) continue;
    const date = normalizeQuietMoneyDate(event.date);
    if (!date) continue;
    byDate.set(date, (byDate.get(date) ?? 0) + event.value);
  }
  if (byDate.size === 0) return undefined;

  const sessions: Array<{ date: string; close: number }> = [];
  for (const candle of (front.candles ?? []).slice(-INSIDER_DIVERGENCE_WINDOW)) {
    const date = normalizeQuietMoneyDate(candle.date);
    if (date && Number.isFinite(candle.close) && candle.close > 0) sessions.push({ date, close: candle.close });
  }
  if (sessions.length === 0) return undefined;

  /**
   * 매수일을 **거래일 격자에 맞춘다.** 공시 거래일이 휴장일이거나 캔들보다 최신이면(캔들은
   * 하루 늦게 확정된다) 그 날짜는 격자에 없다. 맞추지 않으면 누적이 0 에 머물러 선이 평평해지고,
   * A형이 조용히 사라진다 — 실제로는 매수가 있었는데도.
   *
   * 규칙: 그 날짜 **이후 첫 거래일**에 얹는다. 창보다 오래된 매수는 버린다(이 그림은 최근
   * 매집을 말한다). 창보다 최신이면 마지막 거래일에 얹는다.
   */
  const first = sessions[0]!.date;
  const last = sessions.at(-1)!.date;
  const onGrid = new Map<string, number>();
  for (const [date, value] of byDate) {
    if (date < first) continue;
    const session = date > last ? last : sessions.find((s) => s.date >= date)?.date ?? last;
    onGrid.set(session, (onGrid.get(session) ?? 0) + value);
  }
  if (onGrid.size === 0) return undefined;

  const priceSeries: number[] = [];
  const buySeries: number[] = [];
  let cumulative = 0;
  for (const session of sessions) {
    cumulative += onGrid.get(session.date) ?? 0;
    priceSeries.push(session.close);
    buySeries.push(cumulative);
  }
  return { priceSeries, buySeries };
}

/** C형 재료 — 창 안 일별 순매수 여부(오래된 → 최근). */
function buyDaysWindow(
  flows: readonly InvestorFlow[],
  kind: Exclude<QuietPickSignalKind, "insider_cluster">
): boolean[] | undefined {
  if (flows.length === 0) return undefined;
  return [...flows].reverse().slice(-CARD_WINDOW_DAYS).map((flow) => flowNetFor(flow, kind) > 0);
}

// ── 후보(신호 검출 결과) ────────────────────────────────────────────────
interface SignalCandidate {
  subject: QuietPickSubjectSeed;
  kind: QuietPickSignalKind;
  code: SignalTypeCode;
  /** 주체 명사(조사 붙이기 전) — "임원"/"외국인"/"기관"/"외국인·기관". */
  actorNoun: string;
  actors: string;
  scale: string;
  days: number;
  startedAt: string;
  /** US 는 공시가 신호가격, KR 은 캔들에서 확정. */
  priceAtSignal?: number;
  /** 당일 등락률 힌트(US=insider quote). front.signals.changePct 결측 시 폴백. */
  changePctHint?: number;
  /**
   * 신호 **강도**(규모·인원 기반). 같은 종목에 여러 신호가 잡혔을 때 하나를 고르는 데 쓴다.
   *
   * ⛔ **연속일수를 여기에 더하지 말 것**(WO-DECK-01 완료조건 3). 예전에 `100 + 연속일 × 10` 이었고,
   * 그것이 덱 고착의 단일 원인이었다 — 시간이 갈수록 점수가 올라 1등에서 내려올 경로가 없었다.
   * 화면 순위는 `deck-ranking.rankScore`(신규성 1차 축)가 만든다.
   */
  baseStrength: number;
  attentionKey: string;
  // 이례성 원료(검출 단계에서 확보).
  insiderCount?: number;
  valueUsd?: number;
  buyPrice?: number;
  industry?: string;
  /** WO-RESET-03 A-1 — 시장 역행 원료. 이 종류일 때만 있다. */
  marketDivergence?: MarketDivergence;
  /** 비교한 지수 이름 — `코스피` / `코스닥` / `나스닥`. */
  indexLabel?: string;
  /** WO-RESET-03 A-6 — 거래량 각성 원료. 이 종류일 때만 있다. */
  volumeAwakening?: VolumeAwakening;
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
        scale: formatShares(foreign.sum + inst.sum),
        days: Math.min(foreign.days, inst.days),
        startedAt: foreign.startedAt < inst.startedAt ? inst.startedAt : foreign.startedAt,
        // 연속일수 가점 금지(WO-DECK-01 완료조건 3) — 다중 주체라는 사실만 기저값으로 인정한다.
        baseStrength: 300,
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
        baseStrength: 100, // 연속일수 가점 금지(WO-DECK-01) — 순위는 `deck-ranking.rankScore` 가 만든다

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
        baseStrength: 100, // 연속일수 가점 금지(WO-DECK-01)

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
      actorNoun: "임원",
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
      actorNoun: "임원",
      actors: `임원 ${c.insiderCount}명`,
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

/** 어제 픽의 신호 상태(신선도·강화·재승격 판정용). */
export interface QuietPickPriorState {
  startedAt: string;
  days: number;
  insiderCount?: number;
  scale: string;
  /** 어제 규모의 실수치(US=매수금액 USD, KR=순매수 총량) — 문자열 scale 은 버킷이라 증가를 놓친다. */
  amount?: number;
  /** 어제의 신호 유형·코드·주체 — 구조 전환·주체 합류를 재등장 사유로 잡는 데 필요하다. */
  kind?: QuietPickSignalKind;
  code?: SignalTypeCode;
  actors?: string;
  /** 어제 카드가 말한 무효선과 그때 가격 — 오늘 그 선을 넘었는지 판정한다. */
  invalidationLevel?: number | null;
  priceAt?: number;
  /**
   * 경과일 시계의 기준일(WO-DECK-01 §2-4). 기본은 `startedAt` 이고, 재등장 사유가 생긴 날로 리셋된다.
   * **승계해야 한다** — 리셋한 다음 날에는 그 사유가 더 이상 '새 것'이 아니므로 여기서 읽지 않으면
   * 시계가 원래 나이로 되돌아간다.
   */
  ageAnchor?: string;
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
  if (addedPeople > 0) {
    return `${sig.days}일째 계속 — 어제보다 ${addedPeople}명 늘었어요`;
  }
  // ⛔ "어제보다 1일 더 이어졌어요" 는 여기 없다(WO-DECK-01 §3-2) — 지속은 변화가 아니다.
  //    연속 신호는 정의상 매일 하루씩 늘기 때문에, 이 분기가 있으면 어떤 컷에도 걸리지 않았다.

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

/**
 * 재등장 사유 판정(WO-DECK-01 §3-2) — 경과일 상한을 넘었거나 쿨다운이 걸린 종목이
 * **그럼에도** 다시 올라올 수 있는 근거. 하나라도 있으면 경과일 시계를 그 날로 리셋한다.
 *
 * "어제보다 1일 더 이어졌어요" 는 사유가 아니다 — 그건 변화가 아니라 지속이다.
 *
 * ## 무엇을 잡고 무엇을 못 잡나 (정직하게 적는다)
 *
 * | 사유 | 판정 근거 | 한계 |
 * |---|---|---|
 * | `invalidation_break` | 어제 카드의 무효선을 어제 가격은 지켰고 오늘 가격이 깼다 | 장중 이탈 후 회복은 못 본다(종가 기준) |
 * | `new_material` | DART 내부자 장내매수 거래일이 시계 기준일보다 뒤다 | US 는 신호 자체가 공시라 `startedAt` 변화로 잡힌다 |
 * | `actor_joined` | 어제는 단일 주체였는데 오늘 다중 주체 클러스터다 | 같은 주체 안의 인원 증가는 `progress` 쪽이다 |
 * | `structure_shift` | 신호 taxonomy 코드가 바뀌었다(연속 ↔ 전환 등) | 거래량 진공→활성 전환은 아직 못 본다(어제 값 미보존) |
 */
function detectReentry(
  prior: QuietPickPriorState,
  sig: SignalCandidate,
  today: string,
  context: { currentPrice: number; dartTransactionDate?: string }
): QuietPickReentry | null {
  const anchor = prior.ageAnchor && prior.ageAnchor > prior.startedAt ? prior.ageAnchor : prior.startedAt;

  // ① 다른 주체가 합류 — 단일 → 다중 클러스터.
  if (sig.kind === "multi_cluster" && prior.kind && prior.kind !== "multi_cluster") {
    // 합류한 쪽을 이름으로 말한다 — "외국인·기관" 중 어제 없던 주체.
    const joined = prior.actors?.includes("외국인") ? "기관" : "외국인";
    return { code: "actor_joined", text: `${joined}도 사기 시작했어요`, occurredAt: sig.startedAt || today };
  }

  // ② 구조 유형 전환 — taxonomy 코드가 바뀌었다.
  if (prior.code && sig.code !== prior.code) {
    return { code: "structure_shift", text: "거래가 붙기 시작했어요", occurredAt: sig.startedAt || today };
  }

  // ③ 새 재료 — 시계 기준일 이후의 DART 내부자 장내매수.
  if (context.dartTransactionDate && context.dartTransactionDate > anchor) {
    return { code: "new_material", text: "공시가 나왔어요", occurredAt: context.dartTransactionDate };
  }

  // ④ 무효선 이탈 — 어제는 지켰고 오늘 깼다. 되돌아보는 선을 넘은 것 자체가 볼 이유다.
  const level = prior.invalidationLevel;
  if (
    typeof level === "number" && level > 0 &&
    typeof prior.priceAt === "number" && prior.priceAt >= level &&
    context.currentPrice < level
  ) {
    return { code: "invalidation_break", text: "되돌아보는 선을 넘었어요", occurredAt: today };
  }

  return null;
}

/**
 * 경과일 시계 기준일 확정 — 재등장 사유가 있으면 그 날, 없으면 어제 기준일을 승계, 그것도 없으면 신호 시작일.
 * 승계가 핵심이다: 리셋 다음 날 사유가 '새 것'이 아니게 되면서 시계가 원래 나이로 되돌아가는 것을 막는다.
 */
function resolveAgeAnchor(
  sig: SignalCandidate,
  prior: QuietPickPriorState | undefined,
  reentry: QuietPickReentry | null
): string {
  if (reentry) return reentry.occurredAt;
  // 신호가 새로 시작됐으면 승계하지 않는다 — 그 자체가 새 시계다.
  if (prior?.ageAnchor && prior.startedAt === sig.startedAt && prior.ageAnchor > sig.startedAt) {
    return prior.ageAnchor;
  }
  return sig.startedAt;
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
 * 화면에 쓸 수 있는 당일 등락률(%). 못 믿으면 `undefined` — **0.0% 를 지어내지 않는다.**
 *
 * ## 왜 0 을 버리는가 (2026-08-25 실측)
 *
 * 정규 도메인 덱 7장이 **전부 `0.0%`** 였다. 원인은 굽는 시각이었다 —
 * `asOf 2026-08-24T23:57Z` = **08:57 KST, 장 시작 3분 전**. 장전에는 네이버가 등락률
 * `0.00%` 껍데기를 준다. 그 0 이 페이로드에 굳어 하루 종일 화면에 박힌다.
 * (같은 날 23:39 KST 장 마감 후 구운 페이로드는 `+0.7%` 로 정상이었다.)
 *
 * 이 껍데기는 **이미 알려진 것**이다 — `feed-briefing.ts` 의 `krPublishBlockReason` 이
 * `PREOPEN` 을 같은 근거로 차단한다(2026-07-14 실측). 그 가드가 브리핑에만 있고 픽에는
 * 없어서 여기로 새어 나왔다. 종목 row 에는 `marketStatus` 가 없으므로 상태 대신 **값**으로 막는다.
 *
 * 진짜 0.00% 인 날도 함께 가려진다. 그 손실은 받아들인다 — `0.0%` 는 사용자에게 아무것도
 * 알려주지 않고, 껍데기와 구별할 방법도 없다. **구별할 수 없으면 말하지 않는다.**
 *
 * `??` 를 쓰지 않는 이유: `0 ?? x` 는 0 을 돌려주므로 앞 소스의 껍데기 0 이 뒤 소스의 실값을
 * 가로막는다. 그래서 후보를 순서대로 훑되 **0 이 아닌 첫 값**을 고른다.
 */
export function usableChangePct(...candidates: ReadonlyArray<number | undefined>): number | undefined {
  for (const value of candidates) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value === 0) continue; // 장전 껍데기와 진짜 보합을 구별할 수 없다
    return value;
  }
  return undefined;
}


/**
 * WO-RESET-03 PART A-1·A-6 — 가격·거래량 흔적을 신호 후보로 만든다.
 *
 * ## 왜 별도 함수인가
 *
 * 매수 검출기들은 수급 이력을 보고, 이건 **일봉만** 본다. 재료가 다르니 함수도 나눈다.
 * 실패해도 덱이 죽지 않도록 호출부가 `guardedInput` 으로 감싼다 — 이름이 남는다.
 *
 * ## 지수는 한 번만 받는다
 *
 * 코스피·코스닥 두 계열이면 KR 전체를 덮는다. 종목마다 받으면 66번인데 그럴 이유가 없다.
 */
/** 캔들 → 검출기 입력(종가·거래량). 분포 계측과 본 검출이 같은 재료를 보게 한다. */
function points0(candles: readonly DailyOhlcv[]): Array<{ close: number; volume: number }> {
  return candles
    .map((c) => ({ close: c.close, volume: c.volume }))
    .filter((p) => Number.isFinite(p.close) && Number.isFinite(p.volume));
}

async function detectPriceSignals(
  krDefs: readonly StockDef[],
  deps: QuietPickDeps
): Promise<SignalCandidate[]> {
  const codes = krDefs.map((d) => d.naverCode!).filter(Boolean);
  if (codes.length === 0) return [];

  const [candleMap, kospi, kosdaq] = await Promise.all([
    deps.readKrCandleCacheMany(codes),
    deps.fetchStockDaily("KOSPI", 200).catch(() => ({ closes: [] as number[] })),
    deps.fetchStockDaily("KOSDAQ", 200).catch(() => ({ closes: [] as number[] })),
  ]);

  /**
   * 어디서 0이 되는지 보이게 한다. 배포 후 실측에서 D·E 가 **0장**이었는데
   * `inputFailures` 는 비어 있었다 — 실패가 아니라 조건 미달이라는 뜻이고,
   * 그러면 "캐시가 비었나 / 조건이 빡빡한가" 를 화면 밖에서 가릴 방법이 없다.
   * 계수기가 그 둘을 가른다.
   */
  const census = {
    universe: krDefs.length,
    candles: candleMap.size,
    indexKospi: kospi.closes.length,
    indexKosdaq: kosdaq.closes.length,
    tooShort: 0,
    divergence: 0,
    awakening: 0,
    /** 분포 — 임계를 감이 아니라 숫자로 고르기 위한 값(상위 몇 개). */
    maxDivergenceDays: 0,
    stocksWith3PlusDays: 0,
    /** 연속 3일 + 창 안 지수 하락일 조건까지 통과한 종목. */
    streak3AndIndexDown: 0,
    /** 위에 더해 창 전체 지수도 하락한 종목 = D형 게이트를 전부 통과. */
    streak3AndIndexFell: 0,
    stocksWith4PlusDays: 0,
    maxVolumeMultiple: 0,
    stocksWith2xVolume: 0,
    stocksWith15xVolume: 0,
    /** 순변동 분포 — E형 상한을 고른 근거(실측: ≤3% 0종목 · ≤5% 0종목 · ≤7% 2종목). */
    spikeNetUnder3: 0,
    spikeNetUnder5: 0,
    spikeNetUnder7: 0,
    indexFellToday: 0,
  };

  const out: SignalCandidate[] = [];
  for (const def of krDefs) {
    const code = def.naverCode;
    if (!code) continue;
    const candles = candleMap.get(code);
    if (!candles || candles.length < 20) { census.tooShort += 1; continue; }
    const closes = candles.map((c: DailyOhlcv) => c.close).filter((v: number) => Number.isFinite(v) && v > 0);
    const seed: QuietPickSubjectSeed = {
      canonical: def.canonical,
      country: "KR",
      naverCode: code,
      market: def.market ?? "KOSPI",
    };
    const lastDate = candles.at(-1)?.date ?? "";
    const startedAt = lastDate.length === 8 ? `${lastDate.slice(0, 4)}-${lastDate.slice(4, 6)}-${lastDate.slice(6, 8)}` : kstDate();

    // ── 분포 계측(조건 없음) — 어느 조건이 몇 종목을 떨구는지 본다.
    {
      const idx = def.market === "KOSDAQ" ? kosdaq.closes : kospi.closes;
      const n0 = Math.min(closes.length, idx.length, 40);
      if (n0 >= 2) {
        const probe = probeQuietSignals(closes.slice(-n0), idx.slice(-n0), points0(candles));
        if (probe) {
          census.maxDivergenceDays = Math.max(census.maxDivergenceDays, probe.divergenceDays);
          if (probe.divergenceDays >= 3) {
            census.stocksWith3PlusDays += 1;
            /**
             * D형은 게이트가 셋이다(연속일수 · 창 안 지수 하락일 · 창 전체 지수 변동).
             * 첫 실측에서 `stocksWith3PlusDays: 4` 인데 카드는 0장이었다 — 나머지 둘 중
             * 어디서 죽는지 이 두 계수기가 가른다. 합치면 "왜 0장인가"를 감으로 답하게 된다.
             */
            if (probe.indexDownDays >= MARKET_DIVERGENCE_MIN_DOWN_DAYS) census.streak3AndIndexDown += 1;
            if (probe.indexDownDays >= MARKET_DIVERGENCE_MIN_DOWN_DAYS && probe.indexChangePct < 0) {
              census.streak3AndIndexFell += 1;
            }
          }
          if (probe.divergenceDays >= 4) census.stocksWith4PlusDays += 1;
          census.maxVolumeMultiple = Math.max(census.maxVolumeMultiple, Math.round(probe.volumeMultiple * 10) / 10);
          if (probe.volumeMultiple >= 2) {
            census.stocksWith2xVolume += 1;
            const m = Math.abs(probe.movePct);
            if (m <= 3) census.spikeNetUnder3 += 1;
            if (m <= 5) census.spikeNetUnder5 += 1;
            if (m <= 7) census.spikeNetUnder7 += 1;
          }
          if (probe.volumeMultiple >= 1.5) census.stocksWith15xVolume += 1;
          if (probe.indexChangePct < 0) census.indexFellToday += 1;
        }
      }
    }

    // ── A-1 시장 역행 — 코스닥 종목은 코스닥, 그 외는 코스피와 비교한다.
    const indexRaw = def.market === "KOSDAQ" ? kosdaq.closes : kospi.closes;
    const indexLabel = def.market === "KOSDAQ" ? "코스닥" : "코스피";
    if (indexRaw.length >= 10 && closes.length >= 10) {
      // 날짜를 맞출 수 없으므로 **둘 다 뒤에서 같은 길이**로 자른다 — 최근이 남아야 한다.
      const n = Math.min(closes.length, indexRaw.length, 40);
      const d = detectMarketDivergence(closes.slice(-n), indexRaw.slice(-n));
      if (d) {
        census.divergence += 1;
        out.push({
          subject: seed,
          kind: "market_divergence",
          code: "market_divergence" as SignalTypeCode,
          actorNoun: "",
          actors: "시장 대비",
          scale: `${d.days}일 연속`,
          days: d.days,
          startedAt,
          baseStrength: Math.round(Math.abs(d.stockChangePct - d.indexChangePct) * 10),
          attentionKey: def.canonical,
          marketDivergence: d,
          indexLabel,
        });
        continue; // 한 종목에 한 신호 — 중복 제거가 뒤에서 또 걸러도 여기서 아끼는 게 낫다
      }
    }

    // ── A-6 거래량 각성
    const points = candles
      .map((c: DailyOhlcv) => ({ close: c.close, volume: c.volume }))
      .filter((p) => Number.isFinite(p.close) && Number.isFinite(p.volume));
    const a = detectVolumeAwakening(points);
    if (a) {
      census.awakening += 1;
      out.push({
        subject: seed,
        kind: "volume_awakening",
        code: "volume_awakening" as SignalTypeCode,
        actorNoun: "",
        actors: "거래량",
        scale: `${Math.round(a.multiple)}배`,
        days: 1,
        startedAt,
        baseStrength: Math.round(a.multiple * 10),
        attentionKey: def.canonical,
        volumeAwakening: a,
      });
    }
  }
  console.warn("[quiet-pick] price signal census", census);
  priceSignalCensus = census;
  return out;
}

/** 마지막 실행의 계수기 — `qualification` 에 실어 화면 밖에서 원인을 가른다. */
let priceSignalCensus: Record<string, number> | null = null;

/**
 * 조용한 돈 픽 빌드. 크론에서 호출(요청 경로 무거운 fetch 금지 — 504 원칙).
 * priorPickKeys: 어제 픽의 subject#startedAt 키 — 같은 종목·같은 신호 시작이면 신선도 규칙상 제외.
 */
export async function buildQuietPickResponse(options: {
  date?: string;
  deps?: Partial<QuietPickDeps>;
  /** 어제 픽의 신호 상태(WO-P4) — 강화·재등장 판정에 쓴다. */
  priorPicks?: ReadonlyMap<string, QuietPickPriorState>;
  /**
   * canonical → 어제까지 1페이지에 연속으로 있던 일수(WO-DECK-01 §3).
   * 오늘자를 포함하면 자기 자신 때문에 감점되므로 **오늘은 빼고** 넘겨야 한다.
   */
  page1Streaks?: ReadonlyMap<string, number>;
  limit?: number;
} = {}): Promise<QuietPickResponse> {
  const deps = { ...defaultDeps, ...options.deps };
  const date = options.date ?? kstDate();
  const limit = options.limit ?? QUIET_PICK_MAX;
  const priorPicks = options.priorPicks ?? new Map<string, QuietPickPriorState>();
  const page1Streaks = options.page1Streaks ?? new Map<string, number>();
  const drops: Record<string, number> = {};
  const drop = (reason: string) => { drops[reason] = (drops[reason] ?? 0) + 1; };

  /**
   * 입력 실패를 **기록하면서** 삼킨다.
   *
   * 종전에는 각 소스마다 `.catch(() => 빈값)` 이 붙어 있었다. 계속 삼키는 것은 맞다 —
   * 소스 하나가 죽었다고 덱 전체를 못 굽는 것은 과잉이다. 문제는 삼킨 흔적이 어디에도
   * 남지 않아 발행 가드가 판단할 근거가 없었다는 점이다. 이름을 남긴다.
   */
  const inputFailures: string[] = [];
  const guardedInput = <T>(name: string, work: Promise<T>, fallback: T): Promise<T> =>
    work.catch((error) => {
      inputFailures.push(name);
      console.error(`[quiet-pick] 입력 실패 — ${name}`, error instanceof Error ? error.message : error);
      return fallback;
    });

  // 신호 성적(WO-P2 §2) — 유형별 (원장 n≥30 ? 실전 : 백테스트). 없으면 카드가 블록을 숨긴다.
  const signalStatsMap: Partial<Record<SignalTypeCode, SignalStats>> = await readSignalStatsForCards(date).catch(
    () => ({}) as Partial<Record<SignalTypeCode, SignalStats>>
  );

  // ── 신호 검출(①) ──
  /**
   * WO-RESET-04 PART D — 유니버스는 **사전이 아니라 시세 행**에서 만든다(`docs/STATUS.md` §17-A).
   *
   * 그래서 시세를 먼저 받는다. 나머지 입력은 이 유니버스의 종목코드가 있어야 조회할 수 있어서
   * (`readSupplyDemandHistoryByTickers(krCodes, …)`) 한 번은 직렬이 된다 — 실측 279ms 이고,
   * 뒤따르는 배치 조회는 그대로 병렬이다.
   */
  const marketRows = await guardedInput("fetchKrMarketRows", deps.fetchKrMarketRows(), [] as KrMarketRow[]);
  const krUniverse = buildKrPickUniverse(marketRows, deps.vocab);
  const krDefs = krUniverse.defs;
  const krCodes = krDefs.map((d) => d.naverCode!);
  const [histories, insiderRaw, attention, rankMap, usRows, dartInsiders, disclosures, factSheets] = await Promise.all([
    guardedInput("readSupplyDemandHistoryByTickers", deps.readSupplyDemandHistoryByTickers(krCodes, KR_STREAK_WINDOW), {} as Record<string, InvestorFlow[]>),
    guardedInput("fetchInsiderClusterCandidates", deps.fetchInsiderClusterCandidates(), [] as InsiderClusterCandidate[]),
    guardedInput("computeStockAttentionSignals", deps.computeStockAttentionSignals(), {} as Record<string, StockAttentionSignal>),
    guardedInput("fetchMarketCapRankMap", deps.fetchMarketCapRankMap(), {} as Awaited<ReturnType<typeof fetchMarketCapRankMap>>),
    guardedInput("fetchCachedUsMarketRows", deps.fetchCachedUsMarketRows(), [] as KrMarketRow[]),
    guardedInput("fetchDartInsiderPurchasesByStock", deps.fetchDartInsiderPurchasesByStock(date), {} as Record<string, DartDisclosureHit>),
    guardedInput("readDisclosureCollection", deps.readDisclosureCollection(), null as DisclosureCollection | null),
    guardedInput("readAllFactSheets", deps.readAllFactSheets(), [] as Awaited<ReturnType<typeof readAllFactSheets>>),
  ]);

  /** canonical → 팩트시트. 픽마다 배열을 훑지 않도록 한 번만 만든다. */
  const factSheetByStock = new Map(factSheets.map((sheet) => [sheet.canonical, sheet]));

  const krSignals = detectKrSignals(krDefs, histories);
  const usSignals = detectUsInsiderSignals(insiderRaw, date);
  // WO-P4 신호망 확장 — KR 내부자(DART)·수급 전환. 같은 종목 중복은 강도 높은 쪽만 남긴다.
  const dartSignals = detectDartInsiderSignals(krDefs, dartInsiders, date);
  const reversalSignals = detectFlowReversalSignals(krDefs, histories, date);
  /**
   * WO-RESET-03 A-1·A-6 — 「누가 샀나」 말고 다른 흔적. 새 수집 없이 **이미 있는** 일봉으로 만든다.
   *
   * 일봉은 프리웜이 채워둔 캐시에서 **한 쿼리로** 읽는다(`readKrCandleCacheMany`) —
   * 66종목을 `Promise.all` 로 읽으면 커넥션 풀에서 66슬롯을 잡고, 그것이 §12 의 사고였다.
   */
  const priceSignals = await guardedInput(
    "detectPriceSignals",
    detectPriceSignals(krDefs, deps),
    [] as SignalCandidate[]
  );

  const allSignals = dedupeSignalsByStock([
    ...krSignals,
    ...usSignals,
    ...dartSignals,
    ...reversalSignals,
    ...priceSignals,
  ]);

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

  // 프론트 조립은 비용이 크므로 상한을 둔다(잘린 수는 로그로 남긴다).
  //
  // 정렬 키를 **신규성**으로 바꿨다(WO-DECK-01). 예전엔 `baseStrength` 내림차순이었고 그 안에
  // 연속일수 가점이 있었으므로, 오래된 신호가 랭킹뿐 아니라 **조립 우선권까지** 가졌다.
  // 지금은 후보가 60에 닿지 않아 잘림이 없지만(실측 최대 45), 유니버스를 넓히는 순간 2차 고착이 된다.
  const ordered = [...tagged].sort(
    (a, b) => noveltyScore(b.sig.days) - noveltyScore(a.sig.days) || b.sig.baseStrength - a.sig.baseStrength
  );
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
      sealedCandles = await guardedInput("writeUsCandleCache", deps.writeUsCandleCache(sig.subject.symbol, liveCandles), liveCandles.length);
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
    const changePct = usableChangePct(front.signals.changePct, rowChangePct, sig.changePctHint);
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

    // ── 신선도·재등장(WO-P4 + WO-DECK-01 §2-4·§3) ──
    //
    // 예전에는 "순수 반복" 을 **제외**했다. 그런데 연속 신호는 매일 하루씩 늘어 항상 '강화'로 판정돼
    // 이 컷에 걸리지 않았고(실측 `stale_repeat` 일평균 0.4건), 결과적으로 재노출 제어가 없는 상태였다.
    // 이제 순수 반복은 **제외가 아니라 강등**이다 — 신규성 감쇠와 1페이지 쿨다운이 순위로 처리한다
    // (WO 실패 모드: "쿨다운으로 강한 신호가 영원히 안 보임 → 강등이지 제외가 아님").
    const prior = priorPicks.get(sig.subject.canonical);
    const dartTransactionDate = sig.subject.country === "KR"
      ? dartInsiders[sig.subject.canonical]?.insiderPurchase?.transactionDate
      : undefined;
    const reentry = prior
      ? detectReentry(prior, sig, date, {
          currentPrice: current,
          ...(dartTransactionDate ? { dartTransactionDate } : {}),
        })
      : null;
    let progress: string | undefined;
    if (prior && prior.startedAt === sig.startedAt) {
      progress = strengthenedProgress(prior, sig);
      drop(progress ? "repeat_strengthened" : "repeat_demoted"); // 둘 다 탈락 아님 — 관측용 카운터
    }

    // 경과일 시계 — 재등장 사유가 있으면 그 날로 리셋하고, 없으면 어제 기준일을 승계한다.
    const ageAnchor = resolveAgeAnchor(sig, prior, reentry);
    const ageDays = Math.max(0, Math.min(sig.days, daysBetween(ageAnchor, date)));

    // 경과일 상한(§2-4) — 신규 신호가 아니면 픽이 아니라 워치다. 재등장 사유가 있으면 시계가
    // 리셋됐으므로 여기 걸리지 않는다(= 재승격 경로).
    if (isAgedOut(ageDays)) {
      sendToWatch(
        sig,
        { code: "signal_aged", text: `신호가 시작된 지 ${ageDays}일 지났어요 — 새로 생긴 건 아니에요` },
        priceInfo
      );
      continue;
    }

    const page1Streak = page1Streaks.get(sig.subject.canonical) ?? 0;

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

    // US 내부자 이력 — 생존 후보만 조회(비용 큰 per-ticker fetch). 같은 페이지에서 빈도(건수)와
    // A형 누적선 재료(날짜별 매수 금액)를 **한 번에** 받는다(요청 수 증가 0).
    let priorBuys12mo: number | undefined;
    let insiderRows: readonly InsiderPurchaseRow[] = [];
    if (sig.subject.country === "US" && sig.subject.symbol) {
      const history = await deps.fetchInsiderHistory(sig.subject.symbol).catch(() => undefined);
      priorBuys12mo = history?.priorBuys12mo;
      insiderRows = history?.rows ?? [];
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

    // ── 카드 3형(WO-HOOK-01 §1) — 신호가 형을 고른다. 어느 형도 성립 안 하면 픽에서 뺀다. ──
    const flows = sig.subject.naverCode ? histories[sig.subject.naverCode] ?? [] : [];
    /**
     * 누적선의 재료는 **신호의 주체와 같아야 한다.** 임원 신호에 기관 수급을 그리면 범례가
     * 거짓이 된다(§4-2 "임원 매수 누적"). 그래서 주체별로 계열을 나눠 만든다.
     *
     * 임원 신호의 매수 사건은 US 는 12개월 Form 4 행 전체, KR DART 는 이번 공시 1건이다.
     * 행을 못 읽었으면 **이번 신호 자체**를 한 건으로 쓴다 — 그건 우리가 카드에서 말하고 있는
     * 바로 그 매수이므로 지어낸 사실이 아니다.
     */
    const insiderEvents: InsiderBuyEvent[] = isFlowKind(sig.kind)
      ? []
      : insiderRows.flatMap((row) =>
          typeof row.valueUsd === "number" && row.valueUsd > 0 ? [{ date: row.tradeDate, value: row.valueUsd }] : []
        );
    if (!isFlowKind(sig.kind) && insiderEvents.length === 0) {
      const value = sig.valueUsd ?? sig.insiderValueKrw;
      if (typeof value === "number" && value > 0) insiderEvents.push({ date: sig.startedAt, value });
    }
    const divergence = isFlowKind(sig.kind)
      ? flowDivergenceSeries(front, flows, sig.kind)
      : insiderDivergenceSeries(front, insiderEvents);
    const buyDays = isFlowKind(sig.kind) ? buyDaysWindow(flows, sig.kind) : undefined;
    const sparkline = front.sparkline ?? [];
    /**
     * WO-RESET-03 — 「누가 샀나」가 아닌 신호는 **자기 카드 형을 스스로 만든다.**
     *
     * `selectCardType` 은 매수 신호(A·B·C)를 위한 선택기라 여기 넘기면 재료가 안 맞아 `null`
     * 이 나온다. 형이 정해진 신호는 그 형을 바로 쓴다 — 분기가 먼저 걸린다.
     */
    const presetCard =
      sig.kind === "market_divergence" && sig.marketDivergence
        ? marketDivergenceCard({ divergence: sig.marketDivergence, indexLabel: sig.indexLabel ?? "지수" })
        : sig.kind === "volume_awakening" && sig.volumeAwakening
          ? volumeAwakeningCard({ awakening: sig.volumeAwakening })
          : null;
    const cardType = presetCard ?? selectCardType({
      kind: sig.kind,
      days: sig.days,
      priceChangeSincePct: cumulativePct,
      ...(divergence ? { priceSeries: divergence.priceSeries, cumulativeBuySeries: divergence.buySeries } : {}),
      ...(sparkline.length > 0 ? { sparkline } : {}),
      ...(buyDays ? { buyDays } : {}),
      ...(typeof volumePct === "number" ? { volumePct } : {}),
      ...(sparkline.length > 0
        ? { markerIndex: Math.max(0, sparkline.length - 1 - Math.min(sig.days, sparkline.length - 1)) }
        : {}),
      ...(typeof sig.insiderCount === "number" ? { insiderCount: sig.insiderCount } : {}),
      scale: sig.scale,
      ...(typeof priorBuys12mo === "number" ? { priorBuys12mo } : {}),
      ...(typeof vacuumRatio === "number" ? { volumeVacuumRatio: vacuumRatio } : {}),
    });
    if (!cardType) { drop("no_card_type"); continue; }
    // WO-SYNC F-2 — 문장으로 녹기 전의 실수치를 그대로 남긴다. 신호 정체성(kind·actorNoun·
    // scale·days)은 signal 이 이미 갖고 있으므로 뺀다.
    const { kind: _factKind, actorNoun: _factActor, scale: _factScale, days: _factDays, ...signalFacts } = facts;
    const identity = companyIdentity(front, sig);
    const dataQuality: QuietPickDataQuality = {
      candles: availableCandles,
      ...(sealedCandles !== liveCandles.length ? { sealedCandles } : {}),
      fundamentals: typeof score === "number",
      ticker: Boolean(sig.subject.symbol),
      identity: identity.length > 0,
    };

    picks.push({
      subject: {
        ...sig.subject,
        ...companyDisplay(sig.subject),
        identity,
        ...(((): { marketCapText?: string } => {
          const cap = sig.subject.country === "US" && sig.subject.symbol
            ? usMcap.get(sig.subject.symbol.toUpperCase())
            : undefined;
          const text = typeof cap === "number" ? formatMarketCapUsd(cap) : undefined;
          return text ? { marketCapText: text } : {};
        })()),
      },
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
        // 화면 순위는 이것으로 정해진다 — 신규성 × 쿨다운 × 이례성. 연속일수 없음(WO-DECK-01).
        rankScore: deckRankScore({
          ageDays,
          page1Streak,
          ...(anomalies[0] ? { anomalyStrength: anomalies[0].strength } : {}),
        }),
        ageDays,
        ...(ageAnchor !== sig.startedAt ? { ageAnchor } : {}),
        ...(page1Streak > 0 ? { page1Streak } : {}),
        ...(typeof sig.insiderCount === "number" ? { insiderCount: sig.insiderCount } : {}),
        ...(((): { amount?: number } => {
          const amount = signalAmount(sig);
          return amount === undefined ? {} : { amount };
        })()),
        ...(progress ? { progress } : {}),
        ...(reentry ? { reentry } : {}),
      },
      hook: buildQuietPickHook(facts),
      chips: buildQuietPickChips(facts),
      cardType,
      /**
       * 「왜 지금 사는가」 타임라인 (WO-RESET-02 PART C) — **여기서 굳힌다.**
       *
       * 화면이 열릴 때 공시를 가져오지 않는다(A-3). 값·가격은 이 단계에서 밴드 정보를 갖고
       * 있지 않으므로 넘기지 않는다 — 상세가 밴드를 읽어 붙인다(특이할 때만, §C-2 4·5번).
       * 여기서 만드는 것은 **날짜 붙은 항목**이고, 그것이 섹션의 성립 조건이다(§C-3).
       */
      ...(((): { whyNow?: WhyNowEvent[]; whyNowQuietNote?: string } => {
        const list = disclosures?.byStock?.[sig.subject.canonical] ?? [];
        // 실적 전환(PART B) — 상태가 아니라 변화만, 날짜는 그 분기의 공시일이다.
        const quarters = factSheetByStock.get(sig.subject.canonical)?.fiscal?.quarters ?? [];
        const earnings = earningsTurnEvent(quarters);
        const events = buildWhyNowTimeline({
          signalStartedAt: normalizeQuietMoneyDate(sig.startedAt) ?? sig.startedAt.slice(0, 10),
          // 신호가 이미 주체 문자열을 들고 있다 — 카드와 같은 말을 쓴다(`외국인·기관` 포함).
          actor: sig.actors,
          disclosures: list,
          ...(earnings ? { earnings } : {}),
        });
        // 수집이 실제로 이 종목을 덮었는가 — 덮지 않았으면 "없었다" 를 말하지 않는다.
        const collected = disclosures !== null && disclosures !== undefined && disclosures.truncated !== true;
        const note = whyNowQuietNote({ disclosuresCollected: collected, disclosureCount: list.length });
        return {
          ...(events.length > 0 ? { whyNow: events } : {}),
          ...(note ? { whyNowQuietNote: note } : {}),
        };
      })()),
      anomalies,
      ...(Object.keys(signalFacts).length > 0 ? { signalFacts } : {}),
      invalidation: {
        level: invalidationLevel,
        text: front.verdict.invalidation ?? "되돌아보는 선을 계산하려면 캔들이 더 필요해요",
      },
      conviction: {
        whyCompany: front.score?.interpretation || front.score?.label || "",
        whyNow: {
          ...(front.verdict.phase ? { phase: front.verdict.phase } : {}),
          ...(front.wyckoff?.summary
            ? { summary: reconcileStreakClaim(front.wyckoff.summary, sig.actors, sig.days) }
            : {}),
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

  // ── 신규성순 정렬 + 구성 규칙(WO-DECK-01 PHASE 2·4) ──
  //
  // 점수 상위 N 을 그대로 쓰지 않는다. 비율 하한·상한을 지키고, 신규가 부족하면 워치에서 승격하고,
  // 그래도 부족하면 **덱을 줄인다**(지속 신호로 채우지 않는다).
  picks.sort((a, b) => b.signal.rankScore - a.signal.rankScore);
  //
  // 승격 풀은 **비워 둔다.** 워치 선반의 항목은 전부 명시된 게이트에 걸려 내려온 것들이다 —
  // `mega_cap`·`turnover_top20`·`mention_hot` 은 "이미 알려짐"(제품의 핵심 약속을 깨는 승격),
  // `illiquid` 는 매매 불가, `ran_30`·`changed_15` 는 이미 오른 것, `signal_aged` 는 애초에 신규가 아니다.
  // 즉 신규 하한을 메우려고 올릴 수 있는 안전한 후보가 하나도 없다 → 규정대로 **덱을 줄인다.**
  // (`composeDeck` 의 `watchPool` 인자는 승격 가능한 소스가 생기는 날을 위해 남겨 둔다.)
  const entries = picks.map((pick) => ({ kind: pick.signal.kind, ageDays: pick.signal.ageDays, pick }));
  const composed = composeDeck(entries, { deckSize: limit, watchPool: [] });
  const published = composed.deck.map((entry) => entry.pick);
  // 지켜보는 중 — 미달 사유가 '기준 미달'인 것만(품질 실패는 애초에 오지 않는다). 최대 10곳.
  // 덱에 못 든 픽 자격자도 여기 붙인다(신규 하한·유형 상한에 밀린 것들 — 사라지면 안 된다).
  //
  // 선반 문구는 **실제 탈락 사유**를 번역한다. 경과일로 추측하지 않는다 — 실측(2026-08-19):
  // `kind_cap` 으로 밀린 Gbank 에 「오래된 신호라」가 붙어, 사실이 아닌 사유를 화면에 말했다.
  const OVERFLOW_TEXT: Record<DeckSkipReason, string> = {
    kind_cap: "같은 종류 신호가 오늘 덱에 이미 찼어요",
    persistent_cap: "오래 이어진 신호 자리가 이미 찼어요",
    reserved_for_fresh: "그 자리는 새로 생긴 신호 몫이에요",
    shrunk_for_fresh_floor: "새로 생긴 신호가 적어 오늘은 덱을 줄였어요",
    deck_full: "점수는 넘었지만 오늘 덱이 다 찼어요",
  };
  const compositionOverflow: QuietWatchItem[] = entries
    .filter((entry) => !published.includes(entry.pick))
    .map((entry) => {
      const pick = entry.pick;
      const reason = composed.skipReasons.get(entry);
      return {
        subject: pick.subject,
        signal: { kind: pick.signal.kind, code: pick.signal.code, actors: pick.signal.actors, scale: pick.signal.scale, days: pick.signal.days },
        price: { current: pick.price.current, ...(pick.price.currentText ? { currentText: pick.price.currentText } : {}), ...(typeof pick.price.changePct === "number" ? { changePct: pick.price.changePct } : {}) },
        reasonCode: "composition_overflow" as const,
        // 사유가 없으면(있을 수 없지만) 추측 대신 사실만 말한다.
        reasonText: reason ? OVERFLOW_TEXT[reason] : "오늘 덱에는 못 들어갔어요",
      };
    });
  //
  // 선반 정렬 — **어제 픽이었다가 내려온 것을 먼저 보여준다.**
  // 실측(2026-08-18): 선반이 `mega_cap` 10건으로 먼저 차서, 26일째로 강등된 빅텍이 상한에 밀려
  // 화면에서 아예 사라졌다. "강등이지 제외가 아님" 이 표시상 제외가 되면 약속을 지킨 게 아니다.
  const SHELF_PRIORITY: Record<string, number> = {
    signal_aged: 0,
    composition_overflow: 1,
    ran_30_since_signal: 2,
    changed_15: 2,
    turnover_top20: 3,
    mention_hot: 3,
    mega_cap: 4,
    illiquid: 5,
  };
  const watchShelf = [...watching, ...compositionOverflow]
    .map((item, index) => ({ item, index })) // 동순위는 입력 순서(=신규성 순서) 유지
    .sort((a, b) => (SHELF_PRIORITY[a.item.reasonCode] ?? 9) - (SHELF_PRIORITY[b.item.reasonCode] ?? 9) || a.index - b.index)
    .map(({ item }) => item)
    .slice(0, QUIET_WATCH_MAX);

  // 회전율 계측(PHASE 5) — 발행 시점에 굳힌다. 나중에 재계산하면 그날의 이력이 이미 바뀐다.
  const rotation: QuietPickRotation = {
    compositionVersion: composed.version,
    deckSize: published.length,
    caps: composed.caps,
    freshCount: published.filter((pick) => isFreshSignal(pick.signal.ageDays)).length,
    persistentCount: published.filter((pick) => !isFreshSignal(pick.signal.ageDays)).length,
    promotedFromWatch: composed.promoted,
    shrunkBy: composed.shrunkBy,
    compositionSkipped: composed.skipped,
    agedOut: drops.signal_aged ?? 0,
    cooldownApplied: published.filter((pick) => (pick.signal.page1Streak ?? 0) >= 3).length,
    reentryCount: published.filter((pick) => pick.signal.reentry).length,
    page1: published.slice(0, PAGE1_SIZE).map((pick) => pick.subject.canonical),
    page1HeldOver: published
      .slice(0, PAGE1_SIZE)
      .filter((pick) => (pick.signal.page1Streak ?? 0) > 0)
      .map((pick) => ({ canonical: pick.subject.canonical, consecutiveDays: pick.signal.page1Streak ?? 0 })),
    ageDaysMedian: ((): number | null => {
      const ages = published.map((pick) => pick.signal.ageDays).sort((a, b) => a - b);
      return ages.length === 0 ? null : ages[Math.floor(ages.length / 2)]!;
    })(),
  };

  return {
    asOf: new Date().toISOString(),
    date,
    picks: published,
    watching: watchShelf,
    rotation,
    qualification: {
      krUniverse: krDefs.length,
      // PART D 확대가 실제로 먹었는지 — 사전 밖에서 몇 개가 새로 들어왔나. 후퇴하면 source 가 말한다.
      krUniverseSource: krUniverse.source,
      krUniverseFromRows: krUniverse.fromRows,
      krUniverseFromVocab: krUniverse.fromVocab,
      krWithSignal: krSignals.length,
      usInsiderRaw: insiderRaw.length,
      usWithSignal: usSignals.length,
      afterQuiet: quietCandidates.length,
      afterQuality: picks.length,
      published: published.length,
      watching: watchShelf.length,
      drops,
      // 같은 이름이 여러 번 실패할 수 있다(픽별 캔들 봉인 등) — 이름만 남기고 중복은 접는다.
      inputFailures: [...new Set(inputFailures)],
      // WO-RESET-03 진단 — 새 신호가 0장일 때 캐시 결손과 조건 미달을 가른다.
      ...(priceSignalCensus ? { priceSignals: priceSignalCensus } : {}),
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
      kind: pick.signal.kind,
      code: pick.signal.code,
      actors: pick.signal.actors,
      invalidationLevel: pick.invalidation.level,
      priceAt: pick.price.current,
      ...(pick.signal.ageAnchor ? { ageAnchor: pick.signal.ageAnchor } : {}),
      ...(typeof pick.signal.insiderCount === "number" ? { insiderCount: pick.signal.insiderCount } : {}),
      ...(typeof pick.signal.amount === "number" ? { amount: pick.signal.amount } : {}),
    });
  }
  return out;
}

/**
 * 최근 스냅샷들에서 1페이지 연속 점유일수를 뽑는다(WO-DECK-01 §3 쿨다운 입력).
 *
 * `snapshots` 는 **최신 날짜가 먼저**, 그리고 **오늘자는 빠져** 있어야 한다 —
 * 오늘을 넣으면 자기 자신 때문에 감점된다.
 */
export function quietPickPage1Streaks(
  snapshots: ReadonlyArray<QuietPickResponse | null | undefined>
): Map<string, number> {
  const rows = snapshots
    .filter((snap): snap is QuietPickResponse => Boolean(snap?.picks?.length))
    .map((snap) => ({
      // 발행 시점에 굳힌 `rotation.page1` 이 있으면 그것이 정본이다(그날의 실제 1페이지).
      page1: snap.rotation?.page1 ?? snap.picks.slice(0, PAGE1_SIZE).map((pick) => pick.subject.canonical),
    }));
  return page1StreakFromHistory(rows);
}

/**
 * 발행 즉시 판단 원장 append 용 엔트리(성적표 채점 원료 — G1-C).
 * kind="selection" 재사용(DDL 없음) · actor="committee"(픽=위원회 검수) · payload.pickType="quiet" 로 구분.
 * lean payload(stock/front/response 제외) → daily-30 덱 재조립에 섞이지 않음. materializeLedgerOutcomes 가 7/30/90일 자동 채점.
 */
export function quietPickLedgerEntries(
  response: QuietPickResponse,
  /**
   * 발행 시점 스탬프(WO-SUB-07 [F]) — canonical → 스탬프. **소급 불가라 발행 순간에만 만들 수 있다.**
   * 스탬프를 못 만든 픽은 스탬프 없이 기록한다 — 원장 기록 자체가 늦어지면 더 잃는다.
   */
  stamps?: ReadonlyMap<string, PublicationStamp>
): LedgerAppendInput[] {
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
        ...(stamps?.get(pick.subject.canonical) ? { publication: stamps.get(pick.subject.canonical) } : {}),
        // WO-SYNC F-2 — 이례성 원료의 실수치를 원장에도 남긴다. 이게 있어야 "그때 거래량이
        // 평소의 몇 %였나" 를 나중에 문장 파싱 없이 채점할 수 있다.
        ...(pick.signalFacts ? { signalFacts: pick.signalFacts } : {}),
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
