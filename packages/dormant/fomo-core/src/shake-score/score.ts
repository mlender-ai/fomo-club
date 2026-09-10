/**
 * 흔들림 점수(Shake Score) 엔진 — PRODUCT_VISION §8.1 / Phase 5 step 1.
 *
 * "시장의 열기가 아니라, 그 열기에 대한 *오늘 나의 반응*"을 0~100으로. 순수 함수(네트워크/저장 없음).
 *
 * 정의 축(오너 확정): **혼합형** — 시장 열기(카드 fomoScore) × 내 스와이프 관심 반응(more/less).
 *   같은 시장 열기라도 내가 따라가면(more) 높고, 패스하면(less) 낮다. 시장이 광기여도 안 따라가면 낮음.
 * 정직성(§8.2 콜드스타트): 오늘 engagement 가 적으면(< MIN) 가짜 숫자 대신 null + "알아가는 중".
 *   30일 기준선이 없으므로 "평소 대비"는 단정하지 않고, 로컬 로그에 실재하는 어제 버킷만 Δ로 쓴다.
 *
 * 입력은 fomo-web 어댑터가 localStorage(keywordHistory + keywordInterest)를 join 해 넘긴다.
 */

export type ShakeReaction = "more" | "less";

/** 카드 1건 상호작용. reaction 없으면 '봤지만 스와이프 반응 없음'(marketHeat 에만 기여). */
export interface ShakeInteraction {
  keyword: string;
  /** 그 카드의 시장 fomoScore 0~100(군중 쏠림 — 시세 아님). */
  fomoScore: number;
  /** 스와이프 반응. 있으면 engagement 으로 카운트. */
  reaction?: ShakeReaction;
  /** epoch ms (KST 일자 버킷팅용). */
  tsMs: number;
}

export type ShakeConfidence = "ok" | "low" | "insufficient" | "onboarding";

export interface ShakeResult {
  /** 0~100. 콜드스타트(데이터 부족)면 null — 가짜 숫자 금지. */
  score: number | null;
  confidence: ShakeConfidence;
  /** 오늘 본 카드(반응 무관) 평균 fomoScore — "시장 84 vs 너 32" 대조용. 없으면 null. */
  marketHeat: number | null;
  /** 어제 버킷이 충분하면 today.score - yesterday.score, 없으면 null(가짜 안 만듦). */
  deltaVsYesterday: number | null;
  /** 점수 근거(디버그/튜닝/정직성 노출). score 가 null 이면 null. */
  components: { marketPull: number; scatter: number } | null;
  /** 오늘 스와이프 반응(engagement) 수. */
  engagementCount: number;
  /** 오늘 본 카드 수(반응 무관). */
  viewedCount: number;
  reason: string;
}

/** 점수 산출 최소 engagement(이 미만은 콜드스타트). */
const MIN_ENGAGE = 3;
/** confidence "ok" 도달 engagement. */
const OK_ENGAGE = 7;
/** 가중치(튜닝 가능). marketPull = 혼합 본체, scatter = §4.4 시선 옮겨다님. */
const W_PULL = 0.75;
const W_SCATTER = 0.25;
/** less(패스) 반응의 노출 가중 — 봤지만 거의 저항. more=1.0. */
const LESS_WEIGHT = 0.25;
/** scatter 포화: 하루 서로 다른 *뜨거운* 테마 N개 추격하면 분산 1.0. */
const SCATTER_SAT = 3;
/** scatter 에 셀 '뜨거운' 테마 기준 — 혼합형: 차가운 테마 추격은 FOMO 가 아니라 분산에서 제외. */
const HOT_THRESHOLD = 50;

/** Asia/Seoul 기준 YYYY-MM-DD (결정적 — ms 입력만으로). */
function kstDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(ms));
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** 한 일자 버킷의 점수 본체(콜드스타트 판단 전 raw 계산). engaged 가 비면 null. */
function scoreBucket(dayInteractions: readonly ShakeInteraction[]): {
  score: number;
  marketPull: number;
  scatter: number;
  engagementCount: number;
} | null {
  const engaged = dayInteractions.filter((i) => i.reaction);
  if (engaged.length === 0) return null;

  // 혼합: 시장 열기(fomoScore/100) × 내 반응(more=1, less=0.25).
  const pulls = engaged.map(
    (i) => clamp01(i.fomoScore / 100) * (i.reaction === "more" ? 1 : LESS_WEIGHT)
  );
  const marketPull = mean(pulls);

  // 분산: 오늘 'more'로 추격한 서로 다른 *뜨거운* 테마 수(혼합 — 차가운 추격은 FOMO 아님).
  const moreThemes = new Set(
    engaged.filter((i) => i.reaction === "more" && i.fomoScore >= HOT_THRESHOLD).map((i) => i.keyword)
  );
  const scatter = clamp01(moreThemes.size / SCATTER_SAT);

  const score = Math.round(100 * (W_PULL * marketPull + W_SCATTER * scatter));
  return { score, marketPull, scatter, engagementCount: engaged.length };
}

/**
 * 오늘의 흔들림 점수 산출. interactions 는 최근 로컬 로그 전체(여러 날 섞여 있어도 됨 — 내부에서 KST 일자 버킷팅).
 */
export function computeShakeScore(
  interactions: readonly ShakeInteraction[],
  opts: { nowMs: number }
): ShakeResult {
  const todayKey = kstDayKey(opts.nowMs);
  const yKey = kstDayKey(opts.nowMs - 86_400_000);

  const today = interactions.filter((i) => kstDayKey(i.tsMs) === todayKey);
  const yesterday = interactions.filter((i) => kstDayKey(i.tsMs) === yKey);
  const priorDays = new Set(
    interactions.map((i) => kstDayKey(i.tsMs)).filter((k) => k !== todayKey)
  );

  const viewedCount = today.length;
  const engagementCount = today.filter((i) => i.reaction).length;
  const marketHeat = today.length === 0 ? null : Math.round(mean(today.map((i) => i.fomoScore)));

  // 콜드스타트(§8.2): 오늘 engagement 부족 → 숫자 숨김.
  if (engagementCount < MIN_ENGAGE) {
    const onboarding = priorDays.size === 0; // 비교할 어제(과거)가 아예 없음 = 첫날.
    return {
      score: null,
      confidence: onboarding ? "onboarding" : "insufficient",
      marketHeat,
      deltaVsYesterday: null,
      components: null,
      engagementCount,
      viewedCount,
      reason: onboarding
        ? `첫날 — 비교할 어제가 없어 너를 알아가는 중(오늘 ${engagementCount}개 반응)`
        : `오늘 반응 ${engagementCount}개(<${MIN_ENGAGE}) — 데이터 부족, 점수 보류`,
    };
  }

  const t = scoreBucket(today)!;

  // 어제 Δ: 어제도 충분한 engagement 가 있을 때만(없으면 가짜 안 만듦).
  const y = scoreBucket(yesterday);
  const deltaVsYesterday =
    y && y.engagementCount >= MIN_ENGAGE ? t.score - y.score : null;

  return {
    score: t.score,
    confidence: engagementCount >= OK_ENGAGE ? "ok" : "low",
    marketHeat,
    deltaVsYesterday,
    components: { marketPull: t.marketPull, scatter: t.scatter },
    engagementCount,
    viewedCount,
    reason:
      `추격 ${(t.marketPull * 100).toFixed(0)} · 분산 ${(t.scatter * 100).toFixed(0)}` +
      (deltaVsYesterday === null ? " · 어제 데이터 없음" : ` · 어제 대비 ${deltaVsYesterday > 0 ? "+" : ""}${deltaVsYesterday}`),
  };
}
