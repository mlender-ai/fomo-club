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
  /** 등락률 %(부호 포함). 사회적 증거의 결과(보강). */
  changePct?: number;
  /** 52주 신고가 부근/돌파. */
  near52WeekHigh?: boolean;
  // ── 레버 3: 판이 큼 ──
  /** 그날 테마 주목도 순위(1=최고). 키워드 엔진 fomoScore 기반. */
  themeProminenceRank?: number;
  /** 테마 라벨(2행 태그·헤드라인) — 예 "AI 메모리 슈퍼사이클". */
  themeLabel?: string;
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

// 판정·추천·예측 어휘는 isCommentSafe 로 거르고, 점수/등급류만 추가로 막는다.
const FRONT_JUDGMENT =
  /점수|등급|[SAB]\s?급|최우수|유망|강력\s?매수|적극\s?매수|꼭\s?사|놓치면|지금\s?사/;

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
      headline: `지금은 조용한 자리예요 · 다음은 ${when}${next.label}`,
      intensity: "calm",
      angle: "quiet",
      catalysts,
      ...(s.themeLabel ? { themeLabel: s.themeLabel } : {}),
    };
  }
  return {
    headline: "지금은 조용한 자리예요 · 지켜볼 재료가 아직 없어요",
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
  const cur = b.priceText;
  if (high && cur) {
    const h = numOf(high);
    const c = numOf(cur);
    if (h && c && h > 0) out.near52WeekHigh = c >= h * 0.98;
  }
  if (b.summary) {
    const id = firstClause(b.summary);
    if (id) out.identity = id;
  }
  return out;
}
