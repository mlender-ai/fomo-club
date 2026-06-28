// PHASE0_CARD_HOOK (rev2) — 카드 앞면 FOMO 후킹(순수부).
//
// 진짜 후킹 = "남들은 이미 움직이는데 / 곧 결판나고 / 판이 큰데 나만 모른다"를 그 강도만큼 번역한 한 줄
// + 다가오는 재료(지켜볼 거리). 가격·거래량 readout 은 baseline(증권앱 다 있음) — 후킹 아님(rev1 폐기 사유).
//
// FOMO 강도 모델(§2): 후보 앵글마다 5개 레버를 얼마나 치는지로 점수를 매기고 최고 앵글을 헤드라인으로.
//   1) 사회적 증거 ★최강 — 외인·기관 연속 순매수, 거래량 급증 ("남들 이미 움직임")
//   2) D-day 임박 — 실적·승인 등 임박 일정 ("지금 봐야")
//   3) 판이 큼 — 테마 주목도 상위 ("터지면 큰 거")
//   4) 구체·이름 — named catalyst ("재료" 익명 금지)
//   5) 의외성 — 조용한데 사실 큰 게 옴 (인지 갭)
//
// 절대 원칙(§3·§6): 강도에 비례한 톤(전 카드 "지금 핫!" 금지). 예측("오를 것/사라") 금지 —
//   누가 이미 움직였나(사실) + 뭐가 임박했나(일정)로만. 점수·등급·판정 금지. 같은 입력=같은 출력.

import { isCommentSafe } from "./comment";
import type { StockBasics } from "../stock-basics";
import type { FomoScoreResult } from "./fomo-score";
import type { TaFact, TaFactKind } from "./technical-analysis";

/** 다가오는 재료 한 항목(§4 5행) — 구체·일정. 익명 "재료" 금지. */
export interface FomoCatalyst {
  /** 무엇 — 구체 명시("2분기 실적 발표", "HBM 공급계약 보도"). */
  label: string;
  /** 언제/시점 — "7월 말", "6/18"(있으면). */
  when?: string;
  kind: "schedule" | "news" | "flow" | "theme";
}

/** 카드 앞면 후킹에 쓰는 신호 묶음 — 데이터 되는 것만 채운다(없으면 그 레버는 0). */
export interface CardFrontSignals {
  // ── 레버 1: 사회적 증거 ──
  /** 외국인 연속 순매수(+)/순매도(−) 일수. */
  foreignNetStreak?: number;
  /** 기관 연속 순매수(+)/순매도(−) 일수. */
  institutionNetStreak?: number;
  /** 평소 대비 거래량 배수. */
  volumeRatio?: number;
  /** 뉴스·커뮤니티 언급 주목도 0~100. 주목축(attention)에만 사용한다. */
  mentionScore?: number;
  /** 뉴스·커뮤니티 원문에서 감지된 글 수. 디버그·커버리지용. */
  mentionCount?: number;
  /** 오늘 이 종목을 직접 언급한 뉴스/공시형 재료 한 줄. */
  newsEventLabel?: string;
  /** 뉴스 이벤트 출처명. */
  newsEventSource?: string;
  /** 등락률 %(부호 포함). 사회적 증거의 결과(보강). */
  changePct?: number;
  /** 52주 신고가 부근/돌파. */
  near52WeekHigh?: boolean;
  /** 52주 저가권 부근. */
  near52WeekLow?: boolean;
  // ── 레버 3: 판이 큼 ──
  /** 그날 테마 주목도 순위(1=최고). 키워드 엔진 fomoScore 기반. */
  themeProminenceRank?: number;
  /** 테마 라벨(2행 태그·헤드라인) — 예 "AI 메모리 슈퍼사이클". */
  themeLabel?: string;
  /** 테마 안 등락 순위(1=가장 많이 오른 쪽). */
  themeRelativeRank?: number;
  /** 테마 비교에 들어간 종목 수. */
  themePeerCount?: number;
  /** 테마 평균 등락률(%). */
  themeAverageChangePct?: number;
  /** 종목 등락률 - 테마 평균 등락률(%p). */
  themeRelativeChangePct?: number;
  // ── 레버 2·4: D-day·named catalyst ──
  /** 다가오는 재료(구체·일정). 비어도 됨. */
  catalysts?: readonly FomoCatalyst[];
  // ── 컨텍스트(후킹 아님) ──
  /** 시총 순위(1행) — 예 { scope:"market", market:"코스피", rank:1 }. */
  marketCapRank?: { scope: "market" | "sector"; market?: string; rank: number };
  /** 회사 정체성 한 줄(잠잠 보조 — rev2 에선 거의 안 씀). */
  identity?: string;
  /** 시점 라벨 — 예 "6/21". 없으면 "오늘". */
  asOf?: string;
}

/** 채택된 FOMO 앵글(§2 레버). */
export type FomoAngle = "social" | "dday" | "big" | "named" | "surprise" | "quiet";
/** 카드 세기 — 강도 비례 톤·시각 강조용(§3). */
export type FomoIntensity = "high" | "medium" | "calm";

export interface CardFrontHook {
  /** 3행 — FOMO 강도 최고 앵글 한 줄(구체 명시·시점·해요체). */
  headline: string;
  /** 카드 세기(시각 강조·정렬용). */
  intensity: FomoIntensity;
  /** 채택된 앵글. */
  angle: FomoAngle;
  /** 5행 — 다가오는 재료(구체·일정, 익명 금지). 없으면 빈 배열. */
  catalysts: FomoCatalyst[];
  /** 2행 — 테마 태그(있으면). */
  themeLabel?: string;
}

// ── 임계값·가중치(§8.1 광혁 튜닝 대상) ───────────────────────────────────────
export const FRONT_SOCIAL_STREAK_MIN = 3; // 연속 ≥3일
export const FRONT_VOLUME_RATIO_MIN = 1.8; // 거래량 ≥1.8배
export const FRONT_PRICE_PCT_MIN = 3; // 등락 ≥±3%
export const FRONT_THEME_TOP = 3; // 테마 주목도 상위 N

const WEIGHT = {
  socialStreakPerDay: 5, // 연속일수당(상한 적용)
  socialStreakCap: 25,
  socialVolume: 16,
  social52High: 11,
  socialPrice: 8,
  dday: 28, // 임박 일정(가장 셈 — "지금 봐야")
  themeRank: [0, 30, 22, 15] as const, // rank 1→30, 2→22, 3→15
  named: 14,
  surprise: 18,
} as const;

const HIGH_AT = 24;
const MEDIUM_AT = 12;

function intensityOf(score: number): FomoIntensity {
  return score >= HIGH_AT ? "high" : score >= MEDIUM_AT ? "medium" : "calm";
}

// 판정·추천·예측 어휘는 isCommentSafe 로 거르고, 점수/등급류 + has-been(쇠퇴 판정) 관용구를 추가로 막는다.
// ⚠️ "분위기" 자체는 금지 금물(데워지는 분위기 등 정상) — verdict 관용구만 정밀 타깃.
const FRONT_JUDGMENT =
  /점수|등급|[SAB]\s?급|최우수|유망|강력\s?매수|적극\s?매수|꼭\s?사|놓치면|지금\s?사|한\s?물\s?(?:가|간|갔|지)|끝물|한물/;

/** 후킹 텍스트가 가드를 통과하는가(투자조언·예측·점수·등급 없음). */
export function isFrontHookSafe(text: string): boolean {
  // 순매수/순매도는 수급 '사실'(행동 지시 아님) — 가드의 매수/매도 부분일치에서 제외.
  const neutral = text.replace(/순매수|순매도/g, "수급");
  return isCommentSafe(neutral) && !FRONT_JUDGMENT.test(neutral);
}

function fmtPct(p: number): string {
  const sign = p > 0 ? "+" : p < 0 ? "-" : "";
  return `${sign}${Math.abs(p).toFixed(1)}%`;
}
function whenLabel(asOf?: string): string {
  return asOf && asOf.trim() ? `${asOf.trim()} 기준` : "오늘";
}

interface Scored {
  angle: FomoAngle;
  score: number;
  headline: string;
}

/** 사회적 증거(레버 1) — 외인·기관 연속, 거래량 급증, 신고가. */
function scoreSocial(s: CardFrontSignals): Scored | null {
  let score = 0;
  const parts: string[] = [];
  const fs = s.foreignNetStreak ?? 0;
  const is = s.institutionNetStreak ?? 0;
  // 같은 방향(둘 다 순매수 or 둘 다 순매도)일 때 가장 강함.
  const strongStreak = Math.abs(fs) >= FRONT_SOCIAL_STREAK_MIN || Math.abs(is) >= FRONT_SOCIAL_STREAK_MIN;
  if (strongStreak) {
    const both = fs >= FRONT_SOCIAL_STREAK_MIN && is >= FRONT_SOCIAL_STREAK_MIN;
    const bothSell = fs <= -FRONT_SOCIAL_STREAK_MIN && is <= -FRONT_SOCIAL_STREAK_MIN;
    const n = Math.max(Math.abs(fs), Math.abs(is));
    score += Math.min(n * WEIGHT.socialStreakPerDay, WEIGHT.socialStreakCap);
    if (both) parts.push(`외국인·기관 ${n}일째 담는 중`);
    else if (bothSell) parts.push(`외국인·기관 ${n}일째 파는 중`);
    else if (Math.abs(fs) >= Math.abs(is)) parts.push(`외국인 ${Math.abs(fs)}일째 ${fs > 0 ? "순매수" : "순매도"} 중`);
    else parts.push(`기관 ${Math.abs(is)}일째 ${is > 0 ? "순매수" : "순매도"} 중`);
  }
  const vr = s.volumeRatio;
  if (typeof vr === "number" && vr >= FRONT_VOLUME_RATIO_MIN) {
    score += WEIGHT.socialVolume;
    parts.push(`거래량 평소 ${vr.toFixed(1)}배`);
  }
  if (s.near52WeekHigh) {
    score += WEIGHT.social52High;
    if (!strongStreak && !(typeof vr === "number" && vr >= FRONT_VOLUME_RATIO_MIN))
      parts.push("52주 신고가 부근까지 올라왔어요");
  }
  const pct = s.changePct;
  if (typeof pct === "number" && Math.abs(pct) >= FRONT_PRICE_PCT_MIN) {
    score += WEIGHT.socialPrice;
    // 가격 단독이면 readout 이 아니라 '움직임' 문장으로(§rev2: 숫자 한 줄=baseline, 후킹 아님).
    if (parts.length === 0) parts.push(`오늘 ${fmtPct(pct)} 크게 움직였어요`);
  }
  if (score <= 0 || parts.length === 0) return null;
  return { angle: "social", score, headline: parts.slice(0, 2).join(" · ") };
}

/** D-day 임박(레버 2) — 가장 가까운 일정 catalyst. */
function scoreDday(s: CardFrontSignals): Scored | null {
  const sched = (s.catalysts ?? []).find((c) => c.kind === "schedule");
  if (!sched) return null;
  const when = sched.when ? `${sched.when} · ` : "";
  return { angle: "dday", score: WEIGHT.dday, headline: `${when}${sched.label} 임박했어요` };
}

/** 판이 큼(레버 3) — 테마 주목도 상위. */
function scoreBig(s: CardFrontSignals): Scored | null {
  const rank = s.themeProminenceRank;
  if (!rank || rank < 1 || rank > FRONT_THEME_TOP) return null;
  const w = WEIGHT.themeRank[rank] ?? 0;
  if (w <= 0) return null;
  const theme = s.themeLabel?.trim();
  const headline = theme ? `${theme} · 오늘 주목도 ${rank}위 테마예요` : `오늘 주목도 ${rank}위 테마 한복판이에요`;
  return { angle: "big", score: w, headline };
}

/** 구체·이름(레버 4) — named 뉴스 catalyst. */
function scoreNamed(s: CardFrontSignals): Scored | null {
  const named = (s.catalysts ?? []).find((c) => c.kind === "news" && c.label.trim());
  if (!named) return null;
  if (!isFrontHookSafe(named.label)) return null;
  const when = named.when ? `${named.when} · ` : "";
  return { angle: "named", score: WEIGHT.named, headline: `${when}${named.label}` };
}

/** 의외성(레버 5) — 가격은 조용한데 테마/재료는 큰 인지 갭. */
function scoreSurprise(s: CardFrontSignals): Scored | null {
  const quietPrice = !(typeof s.changePct === "number" && Math.abs(s.changePct) >= FRONT_PRICE_PCT_MIN);
  const bigTheme = !!s.themeProminenceRank && s.themeProminenceRank <= FRONT_THEME_TOP;
  const named = (s.catalysts ?? []).some((c) => c.kind === "news");
  if (!quietPrice || (!bigTheme && !named)) return null;
  const theme = s.themeLabel?.trim();
  const headline = theme
    ? `조용해 보여도 ${theme} 한복판에 있어요`
    : "조용해 보여도 큰 흐름 안에 있어요";
  return { angle: "surprise", score: WEIGHT.surprise, headline };
}

/** 다 약할 때 — 차분하게, 다음 재료를 보여준다(§3: "잠잠"으로 끝내지 말 것). */
function quietHook(s: CardFrontSignals): CardFrontHook {
  const next = (s.catalysts ?? [])[0];
  const catalysts = dedupeCatalysts(s.catalysts ?? []);
  if (next) {
    const when = next.when ? `${next.when} · ` : "";
    return {
      headline: `지금은 차분해요 · 다음은 ${when}${next.label}`,
      intensity: "calm",
      angle: "quiet",
      catalysts,
      ...(s.themeLabel ? { themeLabel: s.themeLabel } : {}),
    };
  }
  return {
    headline: "오늘은 뚜렷한 신호 없음",
    intensity: "calm",
    angle: "quiet",
    catalysts,
    ...(s.themeLabel ? { themeLabel: s.themeLabel } : {}),
  };
}

/** 재료 정리 — 일정 먼저, 그다음 뉴스·수급·테마. 익명/중복 제거. 최대 3개. */
function dedupeCatalysts(list: readonly FomoCatalyst[]): FomoCatalyst[] {
  const order: Record<FomoCatalyst["kind"], number> = { schedule: 0, news: 1, flow: 2, theme: 3 };
  const seen = new Set<string>();
  const out: FomoCatalyst[] = [];
  for (const c of [...list].sort((a, b) => order[a.kind] - order[b.kind])) {
    const label = c.label?.trim();
    if (!label || label === "재료" || seen.has(label)) continue; // 익명 "재료" 금지
    seen.add(label);
    out.push(c.when ? { ...c, label } : { ...c, label });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 카드 앞면 FOMO 후킹 — 5개 레버 점수 합이 가장 높은 앵글을 헤드라인으로(고정 우선순위 아님).
 * 강도 비례 톤. 순수·결정적. 채택된 줄이 가드(예측·판정·추천 금지)를 못 넘으면 차분 폴백.
 */
export function buildCardFrontHook(sig: CardFrontSignals = {}): CardFrontHook {
  const candidates = [
    scoreSocial(sig),
    scoreDday(sig),
    scoreBig(sig),
    scoreNamed(sig),
    scoreSurprise(sig),
  ].filter((c): c is Scored => c !== null && isFrontHookSafe(c.headline));

  if (candidates.length === 0) return quietHook(sig);

  // 점수 내림차순, 동점이면 앵글 우선순위(사회적 증거 > D-day > 판 > 이름 > 의외성)로 결정적.
  const rank: Record<FomoAngle, number> = { social: 0, dday: 1, big: 2, named: 3, surprise: 4, quiet: 5 };
  candidates.sort((a, b) => b.score - a.score || rank[a.angle] - rank[b.angle]);
  const top = candidates[0]!;

  // 헤드라인으로 쓴 catalyst(named/dday)는 아래 재료 리스트에서 빼서 중복 노출 방지.
  const all = dedupeCatalysts(sig.catalysts ?? []);
  const catalysts =
    top.angle === "named" || top.angle === "dday"
      ? all.filter((c) => !top.headline.includes(c.label))
      : all;

  return {
    headline: top.headline,
    intensity: intensityOf(top.score),
    angle: top.angle,
    catalysts,
    ...(sig.themeLabel ? { themeLabel: sig.themeLabel } : {}),
  };
}

// ── FOMO_HOOK_SELECTOR — 상태 배지와 분리된 "지금 후킹되는 사실 1개" ─────────────
export type FomoHookSignalKind =
  | "news_event"
  | "axis_tension"
  | "dday"
  | "supply_streak"
  | "volume_event"
  | "mention_event"
  | "relative"
  | "position"
  | "accumulation"
  | "ta_fact"
  | "fallback";

export interface FomoHookSelection {
  /** 카드·상세 히어로가 같이 쓰는 종목별 후킹 헤드라인. */
  headline: string;
  /** 헤드라인과 다른 보조 사실. 없으면 생략한다. */
  subLine?: string;
  /** 헤드라인으로 채택된 신호. */
  kind: FomoHookSignalKind;
}

interface HookCandidate {
  kind: FomoHookSignalKind;
  tier: "material" | "tension" | "shape";
  score: number;
  headline: string;
  subLine?: string;
}

const HOOK_FLOOR = 0.42;
const HOOK_KIND_RANK: Record<FomoHookSignalKind, number> = {
  news_event: 0,
  dday: 1,
  supply_streak: 2,
  mention_event: 3,
  relative: 4,
  axis_tension: 5,
  volume_event: 6,
  position: 7,
  accumulation: 8,
  ta_fact: 9,
  fallback: 10,
};

const EVERYDAY_FORBIDDEN =
  /차트\s?사실|낙폭|과매도|과매수|정배열|역배열|RSI|MACD|볼린저|이평선|신호선|골든크로스|데드크로스|가지런|가격만 먼저|가장 많이 오른 쪽/;

export function isEverydayHookText(text: string): boolean {
  return !EVERYDAY_FORBIDDEN.test(text);
}

function pctText(p: number): string {
  const sign = p > 0 ? "+" : p < 0 ? "-" : "";
  return `${sign}${Math.abs(p).toFixed(1)}%`;
}

function ratioText(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function compactNewsLabel(label: string): string {
  const clean = label
    .replace(/\s+/g, " ")
    .replace(/[.!?。]+$/, "")
    .replace(/\s+소식$/, "")
    .trim();
  if (clean.length <= 38) return clean;
  return `${clean.slice(0, 37)}…`;
}

const TA_EVERYDAY: Record<TaFactKind, string> = {
  accumulation_divergence: "거래는 느는데 가격은 잠잠해요.",
  bollinger_squeeze: "며칠째 가격이 좁은 폭에서만 움직이고 있어요.",
  rsi_overbought: "단기엔 너무 많이 오른 편이에요.",
  rsi_oversold: "며칠 새 빠르게 빠졌고, 단기엔 너무 많이 떨어졌단 신호도 같이 나와요.",
  ma_bullish: "최근 3개월 흐름이 위쪽으로 이어지고 있어요.",
  ma_bearish: "최근 3개월 흐름이 아래쪽으로 이어지고 있어요.",
  macd_bullish: "최근 흐름이 위쪽으로 바뀐 상태예요.",
  macd_bearish: "최근 흐름이 아래쪽으로 바뀐 상태예요.",
  near_52w_high: "최근 1년 중 가장 높은 가격대까지 왔어요.",
  near_52w_low: "최근 1년 낮은 구간에 가까워요.",
  atr_expanded: "하루 가격 움직임이 최근보다 커졌어요.",
};

export function translateTaFact(fact: TaFact | undefined): string | undefined {
  if (!fact) return undefined;
  const text = TA_EVERYDAY[fact.kind] ?? fact.text;
  return isFrontHookSafe(text) && isEverydayHookText(text) ? text : undefined;
}

function fallbackHeadline(_fomo: FomoScoreResult): string {
  return "오늘은 뚜렷한 신호 없음";
}

function pushCandidate(candidates: HookCandidate[], candidate: HookCandidate | null): void {
  if (!candidate) return;
  if (candidate.score < HOOK_FLOOR) return;
  if (!isFrontHookSafe(candidate.headline) || !isEverydayHookText(candidate.headline)) return;
  if (candidate.subLine && (!isFrontHookSafe(candidate.subLine) || !isEverydayHookText(candidate.subLine))) return;
  candidates.push(candidate);
}

function axisTensionCandidate(fomo: FomoScoreResult, signals: CardFrontSignals): HookCandidate | null {
  const pct = typeof signals.changePct === "number" ? signals.changePct : undefined;
  const volumeStrong = typeof signals.volumeRatio === "number" && signals.volumeRatio >= FRONT_VOLUME_RATIO_MIN;
  const attentionRising = fomo.attentionAxis >= 40 || volumeStrong;

  if (fomo.priceMove === "down" && attentionRising) {
    const strength = Math.min(1, Math.max(fomo.attentionAxis / 100, volumeStrong ? 0.62 : 0));
    const headline =
      typeof signals.mentionScore === "number" && signals.mentionScore >= 60
        ? "가격은 빠졌는데, 뉴스·커뮤니티 언급은 늘었어요."
        : "가격은 빠졌는데, 거래량은 오히려 늘었어요.";
    return {
      kind: "axis_tension",
      tier: "material",
      score: 0.92 + strength * 0.18,
      headline,
    };
  }

  if (fomo.priceMove === "up" && fomo.attentionAxis < 60 && typeof pct === "number" && pct >= 5) {
    const gap = Math.min(1, Math.max(0, pct / 12) + Math.max(0, 60 - fomo.attentionAxis) / 120);
    return {
      kind: "axis_tension",
      tier: "material",
      score: 0.9 + gap * 0.2,
      headline: `가격은 ${pctText(pct)} 올랐는데, 거래량·뉴스는 아직 안 따라왔어요.`,
    };
  }

  return null;
}

function supplyCandidate(signals: CardFrontSignals): HookCandidate | null {
  const fs = signals.foreignNetStreak ?? 0;
  const is = signals.institutionNetStreak ?? 0;
  const foreignStrong = fs >= FRONT_SOCIAL_STREAK_MIN;
  const instStrong = is >= FRONT_SOCIAL_STREAK_MIN;
  if (!foreignStrong && !instStrong) return null;

  const n = foreignStrong && instStrong ? Math.min(fs, is) : Math.max(fs, is);
  const actor = foreignStrong && instStrong ? "외국인·기관이" : foreignStrong ? "외국인이" : "기관이";
  return {
    kind: "supply_streak",
    tier: "material",
    score: Math.min(1, 0.5 + n / 10),
    headline: `${actor} ${n}일째 사는 중이에요.`,
  };
}

function newsEventCandidate(signals: CardFrontSignals): HookCandidate | null {
  const label =
    signals.newsEventLabel?.trim() ??
    (signals.catalysts ?? []).find((c) => c.kind === "news" && c.label.trim())?.label.trim();
  if (!label || label === "재료") return null;
  const event = compactNewsLabel(label);
  const headline = `${event} 소식이 나왔어요.`;
  return {
    kind: "news_event",
    tier: "material",
    score: 1.18,
    headline,
  };
}

function ddayCandidate(signals: CardFrontSignals): HookCandidate | null {
  const schedule = (signals.catalysts ?? []).find((c) => c.kind === "schedule" && c.label.trim());
  if (!schedule) return null;
  const when = schedule.when?.trim();
  const label = schedule.label.trim();
  return {
    kind: "dday",
    tier: "material",
    score: 0.88,
    headline: when ? `${when} ${label}가 있어요.` : `${label} 일정이 있어요.`,
  };
}

function volumeCandidate(signals: CardFrontSignals): HookCandidate | null {
  const vr = signals.volumeRatio;
  if (typeof vr !== "number" || vr < FRONT_VOLUME_RATIO_MIN) return null;
  return {
    kind: "volume_event",
    tier: "material",
    score: Math.min(1, 0.42 + vr / 5),
    headline: `최근 거래가 평소 ${ratioText(vr)}배로 늘었어요.`,
  };
}

function mentionCandidate(signals: CardFrontSignals): HookCandidate | null {
  const score = signals.mentionScore;
  const count = signals.mentionCount;
  if (typeof score !== "number" || typeof count !== "number") return null;
  if (score < 60 || count < 2) return null;
  return {
    kind: "mention_event",
    tier: "material",
    score: Math.min(0.78, 0.48 + score / 250),
    headline: `오늘 뉴스·커뮤니티에서 ${count}번 언급됐어요.`,
  };
}

function relativeCandidate(signals: CardFrontSignals): HookCandidate | null {
  const peerCount = signals.themePeerCount ?? 0;
  const rank = signals.themeRelativeRank;
  const delta = signals.themeRelativeChangePct;
  const avg = signals.themeAverageChangePct;
  const pct = signals.changePct;
  const theme = signals.themeLabel?.trim();
  if (peerCount < 3 || typeof rank !== "number" || typeof delta !== "number" || typeof pct !== "number") {
    return null;
  }
  const label = theme ? `${theme} 테마` : "같은 테마";

  if (rank === 1 && pct > 0 && delta >= 2) {
    return {
      kind: "relative",
      tier: "material",
      score: Math.min(0.86, 0.56 + Math.abs(delta) / 20),
      headline: `같은 ${label} 종목들 중 오늘 변동성이 가장 컸어요.`,
    };
  }

  if (typeof avg === "number" && avg >= 2 && pct <= 1.5 && delta <= -3 && rank >= Math.max(2, peerCount - 1)) {
    return {
      kind: "relative",
      tier: "material",
      score: Math.min(0.82, 0.54 + Math.abs(delta) / 22),
      headline: `${label} 안에서 다른 속도의 변동성이 잡혔어요.`,
    };
  }

  return null;
}

function positionCandidate(signals: CardFrontSignals): HookCandidate | null {
  if (signals.near52WeekLow) {
    return {
      kind: "position",
      tier: "material",
      score: 0.56,
      headline: "최근 1년 낮은 구간에 가까워요.",
    };
  }
  if (!signals.near52WeekHigh) return null;
  return {
    kind: "position",
    tier: "material",
    score: 0.58,
    headline: "최근 1년 중 가장 높은 가격대까지 왔어요.",
  };
}

function accumulationCandidate(fomo: FomoScoreResult, taFact?: TaFact): HookCandidate | null {
  if (fomo.inputs.accumulationDivergence !== true && taFact?.kind !== "accumulation_divergence") return null;
  return {
    kind: "accumulation",
    tier: "material",
    score: 0.7,
    headline: "거래는 느는데 가격은 잠잠해요.",
  };
}

function taCandidate(taFact?: TaFact): HookCandidate | null {
  const text = translateTaFact(taFact);
  if (!text) return null;
  const strength: Record<TaFactKind, number> = {
    accumulation_divergence: 0.7,
    near_52w_high: 0.62,
    near_52w_low: 0.58,
    bollinger_squeeze: 0.56,
    rsi_oversold: 0.55,
    rsi_overbought: 0.55,
    atr_expanded: 0.5,
    ma_bullish: 0.48,
    ma_bearish: 0.48,
    macd_bullish: 0.46,
    macd_bearish: 0.46,
  };
  return { kind: "ta_fact", tier: "shape", score: strength[taFact!.kind], headline: text };
}

function secondaryLine(candidates: readonly HookCandidate[], top?: HookCandidate): string | undefined {
  const shape = candidates.find((c) => c.tier === "shape" && c.kind !== top?.kind && c.headline !== top?.headline);
  if (shape) return shape.subLine ?? shape.headline;
  const next = candidates.find((c) => c.kind !== top?.kind && c.headline !== top?.headline);
  return next?.subLine ?? next?.headline;
}

/**
 * 카드/상세 공용 헤드라인 셀렉터.
 * 배지(2축 상태)는 fomoCardView가 유지하고, 이 함수는 데이터로 입증되는 후킹 사실 1개만 고른다.
 */
export function selectFomoHook({
  fomo,
  signals = {},
  taFact,
}: {
  fomo: FomoScoreResult;
  signals?: CardFrontSignals;
  taFact?: TaFact;
}): FomoHookSelection {
  const candidates: HookCandidate[] = [];
  pushCandidate(candidates, newsEventCandidate(signals));
  pushCandidate(candidates, axisTensionCandidate(fomo, signals));
  pushCandidate(candidates, ddayCandidate(signals));
  pushCandidate(candidates, supplyCandidate(signals));
  pushCandidate(candidates, volumeCandidate(signals));
  pushCandidate(candidates, mentionCandidate(signals));
  pushCandidate(candidates, relativeCandidate(signals));
  pushCandidate(candidates, positionCandidate(signals));
  pushCandidate(candidates, accumulationCandidate(fomo, taFact));
  pushCandidate(candidates, taCandidate(taFact));

  candidates.sort((a, b) => b.score - a.score || HOOK_KIND_RANK[a.kind] - HOOK_KIND_RANK[b.kind]);
  const top =
    candidates.find((c) => c.tier === "material") ??
    candidates.find((c) => c.tier === "tension");
  if (!top) {
    const subLine = secondaryLine(candidates);
    return { kind: "fallback", headline: fallbackHeadline(fomo), ...(subLine ? { subLine } : {}) };
  }
  const subLine = secondaryLine(candidates, top);
  return {
    kind: top.kind,
    headline: top.headline,
    ...(subLine ? { subLine } : {}),
  };
}

// ── baseline(stock-basics) → 신호 도출 (규칙 기반, 외부소스·LLM 0) ─────────────
const numOf = (s: string | undefined): number | null => {
  if (!s) return null;
  const c = s.replace(/[^\d.-]/g, "");
  if (!/\d/.test(c)) return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
};

/** 회사 개요 첫 구절만 — "동사는/당사는" 보일러플레이트 제거 후 길면 자른다. */
function firstClause(summary: string): string | undefined {
  const head = summary
    .trim()
    .replace(/^(동사는|당사는|당사|동사)\s*/, "")
    .split(/[.\n·]/)[0]
    ?.trim();
  if (!head) return undefined;
  return head.length > 42 ? `${head.slice(0, 40)}…` : head;
}

/**
 * stock-basics(네이버 baseline) → 카드 앞면 신호 일부. 가격 이벤트(등락률·52주)와 정체성만 채운다.
 * 거래량·수급·테마·재료는 다른 소스에서 합쳐 넣는다(엔진 시그니처는 열려 있음).
 */
export function signalsFromBasics(b: StockBasics): CardFrontSignals {
  const out: CardFrontSignals = {};
  if (b.changeText) {
    // 네이버 등락 비율은 부호 포함 — 예 "8,500 (-2.34%)". 부호를 그대로 쓴다.
    const m = b.changeText.match(/\(\s*([+-]?[\d.]+)\s*%\s*\)/);
    const raw = m?.[1];
    if (raw) {
      let pct = Number(raw);
      if (Number.isFinite(pct)) {
        if (pct > 0 && b.changeDir === "down" && !/^[+-]/.test(raw)) pct = -pct;
        out.changePct = pct;
      }
    }
  }
  const high = b.metrics.find((m) => m.label === "최근 1년 최고가")?.value;
  const low = b.metrics.find((m) => m.label === "최근 1년 최저가")?.value;
  const cur = b.priceText;
  if (high && cur) {
    const h = numOf(high);
    const c = numOf(cur);
    if (h && c && h > 0) out.near52WeekHigh = c >= h * 0.98;
  }
  if (low && cur) {
    const l = numOf(low);
    const c = numOf(cur);
    if (l && c && l > 0) out.near52WeekLow = c <= l * 1.05;
  }
  if (b.summary) {
    const id = firstClause(b.summary);
    if (id) out.identity = id;
  }
  return out;
}
