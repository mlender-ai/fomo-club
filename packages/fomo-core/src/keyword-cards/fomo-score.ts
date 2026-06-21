// FOMO_SCORE_ENGINE — 포모 점수(제품의 척추). 순수·결정적.
//
// 포모 점수 = 군중 *주목 강도*(품질 아님). 카드 앞면·상세·발견 정렬이 전부 이 점수에서 파생.
//   C(현재 강도 0~100) = 거래량 회전(45) + 가격 모멘텀(35) + 언급량(20). ← 카드에 보이는 숫자.
//   L(선행 신호 0~100) = 외국인(60) + 기관(40) 순매수. ← 점수 아님, "오는 중 💎" 플래그.
//   상태 라벨 = C × 방향 × L.
//
// 절대 원칙(§4): 가짜숫자 금지(입력 없으면 제외+confidence↓) · 결정적 · 품질판정/추천/예측 금지
//   (C·L 둘 다 *사실*=주목·수급만) · source-kind separation(community=주목 측정에만, 강세/약세 근거 아님)
//   · 비용방어(baseline 입력 싸게 항상).

import { isFrontHookSafe } from "./card-front-hook";

// ── 가중치·임계값 (§6 광혁 튜닝 대상 — User Zero 스와이프하며 조임) ──────────────
export const C_WEIGHTS = { volume: 45, price: 35, mention: 20 } as const; // 거래량>가격>언급(트레이더 근거)
export const L_WEIGHTS = { foreign: 60, institution: 40 } as const;
export const FOMO_THRESHOLDS = { hot: 80, warm: 60, quiet: 40, lead: 60 } as const;
/** 정규화 기준점 — 거래량 3.5배=만점, 등락 8%=만점, 수급 5일연속·시총대비 1%=만점. */
export const FOMO_NORM = { volTopX: 3.5, priceTopPct: 8, streakTopDays: 5, ratioTopPct: 0.01 } as const;
/** 매집 다이버전스(§6.4 — 거래량↑·가격 평탄 = 조용히 담는 중). L 보너스 + 💎 보조 트리거. */
export const ACCUMULATION = { enabled: true, volMin: 1.8, priceFlatMax: 2, leadBonus: 15 } as const;
/** 방향 — 어제(또는 3일 전) C 대비. flat 밴드 ±5, 강한 하락 = C 10↓ 또는 가격 -5%. */
export const FOMO_DIRECTION = { flatBand: 5, strongDropDelta: 10, strongDropPct: -5 } as const;

export type FomoDirection = "up" | "down" | "flat";
export type FomoLabel = "hot" | "warming" | "incoming" | "quiet" | "silent" | "cooling";

/** 엔진 입력 — 데이터 되는 것만 채운다(없으면 그 항목 제외 + confidence↓). 배선은 후속(②③④). */
export interface FomoScoreInputs {
  // C — 현재 강도
  /** 평소 대비 거래량 배수(거래량 회전). */
  volumeRatio?: number;
  /** 등락률 %(부호 포함) — 가격 모멘텀. */
  changePct?: number;
  /** 추세 강도 0~1(스파크라인 기반, 가격 모멘텀 보강). */
  trendStrength?: number;
  /** 언급·뉴스량 0~100(키워드 엔진/커뮤니티 — *주목 측정에만*). */
  mentionScore?: number;
  // L — 선행 신호(순매수 방향만 기여)
  foreignNetStreak?: number;
  foreignNetRatio?: number; // 시총 대비 비중 0~1
  institutionNetStreak?: number;
  institutionNetRatio?: number;
  // 방향
  /** 어제(또는 최근 3일) C — 방향 산출용. */
  prevScore?: number;
  /** 수급 기준일(시점 명시) — 예 "6/21". */
  asOf?: string;
}

export interface FomoScoreResult {
  /** C — 현재 강도(카드 숫자). */
  fomoScore: number;
  /** L — 선행 신호(💎 플래그용, 점수 아님). */
  leadSignal: number;
  direction: FomoDirection;
  label: FomoLabel;
  /** 라벨 한 줄(해요체 · 사실만 · 예측/판정 0). */
  labelText: string;
  /** 수급 등 시점. */
  asOf?: string;
  /** 0~1 — C 입력 충실도(가짜숫자 방지). */
  confidence: number;
  /** 기여 근거(정규화값 0~100, 어느 항목이 들어갔나). */
  inputs: {
    volume?: number;
    price?: number;
    mention?: number;
    foreign?: number;
    institution?: number;
    accumulationDivergence?: boolean;
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp100 = (x: number) => (x < 0 ? 0 : x > 100 ? 100 : x);

function volTo100(ratio: number): number {
  return clamp01((ratio - 1) / (FOMO_NORM.volTopX - 1)) * 100;
}
function priceTo100(changePct?: number, trendStrength?: number): number {
  const fromPct = typeof changePct === "number" ? clamp01(Math.abs(changePct) / FOMO_NORM.priceTopPct) : 0;
  const fromTrend = typeof trendStrength === "number" ? clamp01(trendStrength) : 0;
  return Math.max(fromPct, fromTrend) * 100;
}
/** 순매수(양의 streak)만 선행 신호에 기여 — 순매도는 L=0(식는 신호는 방향이 담당). */
function supplyTo100(streak?: number, ratio?: number): number | undefined {
  if (typeof streak !== "number" || streak <= 0) return streak === undefined ? undefined : 0;
  const fromStreak = clamp01(streak / FOMO_NORM.streakTopDays);
  if (typeof ratio === "number") return (fromStreak * 0.6 + clamp01(ratio / FOMO_NORM.ratioTopPct) * 0.4) * 100;
  return fromStreak * 100;
}

const LABEL_TEXT: Record<FomoLabel, string> = {
  hot: "지금 시장의 한복판이에요",
  warming: "관심이 데워지는 중이에요",
  incoming: "조용한데 외국인·기관은 이미 들어오는 중이에요",
  quiet: "지금은 조용한 자리예요",
  silent: "재료도 수급도 아직 조용해요",
  cooling: "한 물 가는 분위기예요",
};

/**
 * 포모 점수 산출 — C(현재 강도)·L(선행)·방향·상태 라벨. 순수·결정적.
 * 입력 없는 항목은 제외하고 가중치 재정규화 + confidence 반영(가짜숫자 금지).
 */
export function computeFomoScore(input: FomoScoreInputs = {}): FomoScoreResult {
  const inputs: FomoScoreResult["inputs"] = {};

  // ── C — 현재 강도 ──
  let cNum = 0;
  let cDen = 0;
  if (typeof input.volumeRatio === "number") {
    inputs.volume = volTo100(input.volumeRatio);
    cNum += inputs.volume * C_WEIGHTS.volume;
    cDen += C_WEIGHTS.volume;
  }
  if (typeof input.changePct === "number" || typeof input.trendStrength === "number") {
    inputs.price = priceTo100(input.changePct, input.trendStrength);
    cNum += inputs.price * C_WEIGHTS.price;
    cDen += C_WEIGHTS.price;
  }
  if (typeof input.mentionScore === "number") {
    inputs.mention = clamp100(input.mentionScore);
    cNum += inputs.mention * C_WEIGHTS.mention;
    cDen += C_WEIGHTS.mention;
  }
  const C = cDen > 0 ? Math.round(cNum / cDen) : 0;
  const confidence = clamp01(cDen / (C_WEIGHTS.volume + C_WEIGHTS.price + C_WEIGHTS.mention));

  // ── L — 선행 신호(순매수만) ──
  const fComp = supplyTo100(input.foreignNetStreak, input.foreignNetRatio);
  const iComp = supplyTo100(input.institutionNetStreak, input.institutionNetRatio);
  let lNum = 0;
  let lDen = 0;
  if (fComp !== undefined) {
    inputs.foreign = fComp;
    lNum += fComp * L_WEIGHTS.foreign;
    lDen += L_WEIGHTS.foreign;
  }
  if (iComp !== undefined) {
    inputs.institution = iComp;
    lNum += iComp * L_WEIGHTS.institution;
    lDen += L_WEIGHTS.institution;
  }
  let L = lDen > 0 ? Math.round(lNum / lDen) : 0;

  // 매집 다이버전스 — 거래량↑인데 가격 평탄 = 조용히 담는 중(거래량 논리 직계 선행 신호).
  const divergence =
    ACCUMULATION.enabled &&
    typeof input.volumeRatio === "number" &&
    input.volumeRatio >= ACCUMULATION.volMin &&
    typeof input.changePct === "number" &&
    Math.abs(input.changePct) < ACCUMULATION.priceFlatMax;
  if (divergence) {
    inputs.accumulationDivergence = true;
    L = clamp100(L + ACCUMULATION.leadBonus);
  }

  // ── 방향 ──
  let direction: FomoDirection = "flat";
  if (typeof input.prevScore === "number") {
    const delta = C - input.prevScore;
    direction = Math.abs(delta) < FOMO_DIRECTION.flatBand ? "flat" : delta > 0 ? "up" : "down";
  }
  const strongDown =
    (typeof input.changePct === "number" && input.changePct <= FOMO_DIRECTION.strongDropPct) ||
    (typeof input.prevScore === "number" && C - input.prevScore <= -FOMO_DIRECTION.strongDropDelta);

  // ── 상태 라벨(임계값 §2, 빈틈 없이) ──
  let label: FomoLabel;
  if (strongDown && C >= FOMO_THRESHOLDS.warm) label = "cooling";
  else if (C >= FOMO_THRESHOLDS.hot) label = "hot";
  else if (C >= FOMO_THRESHOLDS.warm) label = "warming";
  else if (L >= FOMO_THRESHOLDS.lead) label = "incoming"; // 💎 C<60 & L≥60
  else if (C >= FOMO_THRESHOLDS.quiet) label = "quiet";
  else label = "silent";

  const out: FomoScoreResult = {
    fomoScore: C,
    leadSignal: L,
    direction,
    label,
    labelText: LABEL_TEXT[label],
    confidence,
    inputs,
  };
  if (input.asOf) out.asOf = input.asOf;
  return out;
}

/** 💎 "오기 직전" — 현재는 조용한데 수급이 먼저 들어오는 자리. */
export function isLeadingSetup(score: FomoScoreResult): boolean {
  return score.fomoScore < FOMO_THRESHOLDS.warm && score.leadSignal >= FOMO_THRESHOLDS.lead;
}

/** 모든 라벨 문구가 가드(예측·판정·점수 어휘 0)를 통과하는지 — 불변식. */
export function fomoLabelTextsSafe(): boolean {
  return Object.values(LABEL_TEXT).every((t) => isFrontHookSafe(t));
}

// ── 카드 앞면 표현(척추 ② — 엔진 출력 → 카드. 단일 출처) ──────────────────────
export type FomoTone = "hot" | "incoming" | "warming" | "calm" | "cooling";

export interface FomoCardView {
  /** 2행 점수 — "포모 72"(주목도 명시). 데이터 0이면 빈 문자열(보류). */
  scoreText: string;
  /** 라벨 이모지 — 🔥/💎(나머지 없음). */
  emoji: string;
  /** 짧은 상태 배지 — "지금 한복판"/"오기 직전"/"데우는 중"/"조용"/"식는 중". */
  badge: string;
  /** 4행 헤드라인 — 강도 비례·섹터 인지·근거 우선. 예측/판정 0. */
  headline: string;
  /** 톤(색·강조 매핑용). */
  tone: FomoTone;
  /** 💎 "오기 직전" 특별 취급 여부. */
  isLeading: boolean;
}

const BADGE: Record<FomoLabel, string> = {
  hot: "지금 한복판",
  warming: "데우는 중",
  incoming: "오기 직전",
  quiet: "조용",
  silent: "조용",
  cooling: "식는 중",
};
const EMOJI: Record<FomoLabel, string> = {
  hot: "🔥",
  warming: "",
  incoming: "💎",
  quiet: "",
  silent: "",
  cooling: "",
};
const TONE: Record<FomoLabel, FomoTone> = {
  hot: "hot",
  warming: "warming",
  incoming: "incoming",
  quiet: "calm",
  silent: "calm",
  cooling: "cooling",
};

/**
 * 포모 점수 → 카드 앞면 표현(점수·라벨·헤드라인·톤). 순수·결정적. 단일 출처(휴리스틱 대체).
 * 헤드라인은 강도 비례·섹터 인지. 💎는 특별 문구(예측 금지 — "이미 움직였다"는 사실까지만).
 * 근거(reason, 발굴 named)가 있으면 더 구체적이라 우선 — 단 💎는 특별 문구 유지, 가드 위반 reason 은 폐기.
 */
export function fomoCardView(score: FomoScoreResult, opts: { sector?: string; reason?: string } = {}): FomoCardView {
  const { label } = score;
  const sector = opts.sector?.trim();
  const reason = opts.reason?.trim();
  const isLeading = label === "incoming";

  let headline: string;
  if (isLeading) {
    headline = "조용한데 외국인·기관이 이미 움직였어요 · 아직 사람들은 몰라요";
  } else if (reason && isFrontHookSafe(reason)) {
    headline = reason;
  } else {
    switch (label) {
      case "hot":
        headline = sector ? `지금 ${sector}에서 가장 시선이 몰리는 자리예요` : "지금 가장 시선이 몰리는 자리예요";
        break;
      case "warming":
        headline = sector ? `${sector} 관심이 데워지는 중이에요` : "관심이 데워지는 중이에요";
        break;
      case "cooling":
        headline = "한 물 가는 분위기예요";
        break;
      case "silent":
        headline = "재료도 수급도 아직 조용해요";
        break;
      case "quiet":
      default:
        headline = "지금은 조용한 자리예요";
    }
  }

  return {
    scoreText: score.confidence > 0 ? `포모 ${score.fomoScore}` : "",
    emoji: EMOJI[label],
    badge: BADGE[label],
    headline,
    tone: TONE[label],
    isLeading,
  };
}

// ── 순위 (척추 §3) — 포모 순위·시총 순위 공통. 시장 전체 & 섹터 둘 다. 순수·결정적. ─────────
export interface RankInput {
  key: string;
  /** 정렬 점수(포모 점수 또는 시총 — 높을수록 1위). */
  score: number;
  sector?: string;
}
export interface RankResult {
  /** 시장 전체 순위(1=최고). */
  overall: number;
  /** 섹터 내 순위(섹터 있을 때만). */
  sector?: number;
}

/**
 * 점수 내림차순 순위 — 시장 전체 + 섹터별. 동점은 key 사전순으로 결정적 tiebreak.
 * 포모 순위(score=C)·시총 순위(score=marketCap) 모두 이 함수로(척추 §3).
 */
export function rankByScore(items: readonly RankInput[]): Map<string, RankResult> {
  const cmp = (a: RankInput, b: RankInput) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const overall = [...items].sort(cmp);
  const sectorPos = new Map<string, number>();
  const result = new Map<string, RankResult>();
  overall.forEach((it, i) => {
    const r: RankResult = { overall: i + 1 };
    if (it.sector) {
      const n = (sectorPos.get(it.sector) ?? 0) + 1;
      sectorPos.set(it.sector, n);
      r.sector = n;
    }
    result.set(it.key, r);
  });
  return result;
}
