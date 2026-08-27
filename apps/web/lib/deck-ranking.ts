/**
 * WO-DECK-01 PHASE 2~4 — 덱 랭킹·구성 규칙(순수부, I/O 없음).
 *
 * ## 왜 이 파일이 생겼나
 *
 * 기존 랭킹은 `baseStrength` 하나였고 그 안에 **연속일수 선형 가점**이 있었다
 * (`institution_streak = 100 + 연속일 × 10`, 상한 없음, 감쇠 없음). PHASE 1 실측
 * (`docs/audit/DECK_STAGNATION.md`)에서 확인된 것:
 *
 *   - 여섯 공식 어디에도 시간 감쇠 항이 없다 → 1등에서 내려올 구조적 경로가 없다.
 *   - `institution_streak` 기저 100 은 내부자 클러스터(200~210)보다 **낮다**. 즉 KR 연속 신호를
 *     상위로 올리는 힘은 규모도 이례성도 아니라 **오직 신호의 나이**였다.
 *   - 빅텍은 15일 중 덱 13일·**1페이지 12일**. 1위 연속은 5일뿐인데 1페이지에서 나가지 않았다.
 *
 * 그래서 랭킹의 1차 축을 **신규성**으로 바꾼다. 연속일수는 이례성 판정(창 내 최장)과
 * 최소 조건(`STREAK_MIN_DAYS`)에만 남고 **가점으로는 쓰지 않는다.**
 *
 * ## 파라미터 도출 근거 (감으로 정한 값이 하나도 없어야 한다)
 *
 * 전부 PHASE 1 실측 분포(발행 픽 n=150, 2026-08-04~18)에서 나왔다. 유니버스나 신호 유형이
 * 바뀌면 **다시 봐야 한다** — 그때 이 주석이 근거를 잃으면 아무도 값을 못 바꾼다.
 */

/**
 * 신규성 반감기(달력일). **경과일 중앙값 5일** 에서 정확히 절반이 되도록 잡았다.
 *
 * 실측 분포: 중앙값 5일 · p75 8일 · ≤3일 19% · ≤7일 72% · ≤14일 91.3% · 최대 26일.
 * 유형별 중앙값은 `insider_cluster` 5일 · `multi_cluster` 3일 · `foreign_streak` 6일 ·
 * `institution_streak` **17일**. 계단이 아니라 지수를 쓰는 이유는 두 가지다 —
 *   ① 경계에서 순위가 튀지 않는다(7일 컷오프는 7일과 8일 사이가 절벽이다).
 *   ② 중앙값이 5일인 유형과 17일인 유형을 **한 축에서** 비교할 수 있다.
 * 26일이면 2.7점으로 사실상 소멸한다.
 */
export const NOVELTY_HALFLIFE_DAYS = 5;

/** 신규성 만점(신호가 오늘 처음 나타난 날). 점수 스케일의 기준. */
export const NOVELTY_MAX = 100;

/**
 * 이 경과일을 넘으면 "신규 신호"가 아니므로 픽 후보에서 워치로 강등한다(WO 2-4).
 *
 * 14일로 잡은 이유: 내부자 클러스터의 소스 상한(`INSIDER_MAX_TRADE_AGE_DAYS = 14`)과 **축이 통일**된다.
 * 서로 다른 기준이 두 개 돌아다니면 나중에 어긋난다.
 * 실측 영향: 발행 150건 중 91.3% 가 ≤14일이므로 13건(8.7%)만 내려간다 — 덱이 비지 않는다.
 *
 * **강등은 영구 배제가 아니다.** 재등장 사유가 생기면 픽으로 재승격하고 경과일 시계를
 * 그 사유 발생일로 리셋한다(`ageAnchor`). 빅텍이 26일째라 지금 내려가는 것은 맞지만,
 * 내일 외국인이 합류하면 그것은 새 신호이므로 26일 누적으로 계속 눌려 있으면 안 된다.
 */
export const SIGNAL_AGE_MAX_DAYS = 14;

/** '신규 신호'의 정의(경과일 이내). 실측 ≤7일 = 발행의 72% — 구성 하한의 기준선. */
export const FRESH_AGE_DAYS = 7;

/** 1페이지로 보는 상위 순위 수. */
export const PAGE1_SIZE = 3;

/**
 * 덱 크기 — **설정값이다.** 10장은 지금 다듬는 단위지 제품 정의가 아니다.
 * 구성 규칙을 장수(6장·4장)로 박으면 5장이나 20장으로 갈 때 전부 다시 짜야 하므로 **비율로** 둔다.
 */
export const DECK_SIZE = 10;

/** 신규 신호 최소 비율. 실측 72% 보다 낮게 잡아 공급 여유를 둔다. */
export const MIN_FRESH_RATIO = 0.6;
/** 같은 신호 유형 최대 비율. 실측 `insider_cluster` 65% 를 반영해 편중을 이 선에서 끊는다. */
/**
 * 한 유형이 덱에서 차지할 수 있는 최대 비율.
 *
 * WO-RESET-03 E-3 이 **절반**으로 못박았다 — "한 종류가 전체의 절반을 넘으면, 넘는 만큼은
 * 뒤로 보낸다." 종전 0.6 은 카드 종류가 사실상 하나(누가 샀나)이던 시절의 값이라 사실상
 * 무의미했다. 종류가 늘어난 지금은 이 값이 실제로 화면을 바꾼다.
 */
export const MAX_SAME_KIND_RATIO = 0.5;
/** 지속 신호(>FRESH_AGE_DAYS) 최대 비율. 위 신규 하한에서 파생된다(1 − 0.6). */
export const MAX_PERSISTENT_RATIO = 0.4;

/**
 * 인물 카드(유명 투자자) 최대 비율 — WO-RESET-07 §E-2.
 *
 * 인물 카드는 **같은 덱에 섞는다**(별도 섹션을 만들지 않는다 — §E-1). 다만 이름값이
 * 강해서 상한이 없으면 덱이 통째로 인물 카드가 된다. 그러면 이 앱은 「조용한 돈」이
 * 아니라 유명인 추종 앱이 된다.
 */
export const MAX_INVESTOR_RATIO = 0.4;

/**
 * 13F 시즌에는 상한을 푼다(§E-2).
 *
 * 분기 공시가 몰리는 2·5·8·11월 중순에는 인물 카드가 한꺼번에 쏟아진다. 그때 40%로 막으면
 * **가장 재미있는 날에 가장 많이 버린다.** 그 시즌은 원래 그런 시즌이다.
 */
export const MAX_INVESTOR_RATIO_13F_SEASON = 0.6;

/** 한 인물이 덱에서 연달아 차지할 수 있는 최대 장수(§E-2). */
export const MAX_SAME_INVESTOR = 2;

/**
 * 13F 시즌인가 — 분기 종료 45일 뒤가 마감이라 **2·5·8·11월 중순**에 몰린다.
 * 날짜 형식이 아니면 시즌이 아닌 것으로 본다(넓히는 쪽이 아니라 좁히는 쪽으로 틀린다).
 */
export function is13fSeason(date: string): boolean {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return [2, 5, 8, 11].includes(month) && day >= 10 && day <= 25;
}

/**
 * 재노출 쿨다운 — **누진 계수**. 오래 버틸수록 더 강하게 누른다.
 *
 * 완전 제외가 아니라 점수 강등이다: 신호 강도가 여전히 이길 수 있어야 한다.
 * 1페이지 밖으로 기계적으로 밀어내면 "왜 이게 4위지?" 에 대한 답이 "어제 1위였으니까" 밖에 없다.
 * 위에서부터 처음 맞는 칸을 쓴다(내림차순 유지 필수 — `page1CooldownFactor` 가 순서를 신뢰한다).
 */
export const COOLDOWN_LADDER: ReadonlyArray<{ minConsecutiveDays: number; factor: number }> = [
  { minConsecutiveDays: 7, factor: 0.25 },
  { minConsecutiveDays: 5, factor: 0.40 },
  { minConsecutiveDays: 3, factor: 0.60 },
];

/**
 * 이례성이 순위에 줄 수 있는 최대 가중(비율). 1차 축(신규성)을 **뒤집지 못하도록** 곱셈으로 제한한다.
 * `computeQuietPickAnomalies` 의 strength 는 1.0~4.3 스케일이다.
 */
export const ANOMALY_WEIGHT_MAX = 0.3;
const ANOMALY_STRENGTH_FULL = 4.3;

/** 구성 규칙 버전 — 규칙이 바뀌면 이 값을 올린다(WO 완료조건 7). */
export const DECK_COMPOSITION_VERSION = "deck-composition/v1";

/**
 * 신규성 점수 — 신호가 처음 나타난 날 최대, 경과일에 따라 지수 감쇠.
 * 음수 경과일(시계 오차·미래 날짜)은 0일로 취급한다 — 만점을 넘기지 않는다.
 */
export function noveltyScore(ageDays: number): number {
  const age = Number.isFinite(ageDays) ? Math.max(0, ageDays) : 0;
  return NOVELTY_MAX * Math.pow(0.5, age / NOVELTY_HALFLIFE_DAYS);
}

/** 신규 신호인가(구성 하한 판정용). */
export function isFreshSignal(ageDays: number): boolean {
  return ageDays <= FRESH_AGE_DAYS;
}

/** 픽 자격을 잃을 만큼 늙은 신호인가(워치 강등 판정용). */
export function isAgedOut(ageDays: number): boolean {
  return ageDays > SIGNAL_AGE_MAX_DAYS;
}

/** 1페이지 연속 점유일수 → 점수 계수. 3일 미만이면 감점 없음(1.0). */
export function page1CooldownFactor(consecutivePage1Days: number): number {
  const days = Number.isFinite(consecutivePage1Days) ? Math.max(0, consecutivePage1Days) : 0;
  for (const step of COOLDOWN_LADDER) {
    if (days >= step.minConsecutiveDays) return step.factor;
  }
  return 1;
}

/** 이례성 강도 → 곱셈 가중(1 + w). 값이 없으면 가중 없음. */
export function anomalyMultiplier(topStrength: number | undefined): number {
  if (typeof topStrength !== "number" || !Number.isFinite(topStrength) || topStrength <= 0) return 1;
  const w = Math.min(ANOMALY_WEIGHT_MAX, (topStrength / ANOMALY_STRENGTH_FULL) * ANOMALY_WEIGHT_MAX);
  return 1 + w;
}

export interface RankInput {
  /** 유효 경과일 — 재승격 시계(`ageAnchor`) 반영 후의 값. */
  ageDays: number;
  /** 어제까지 1페이지에 연속으로 있던 일수. */
  page1Streak?: number;
  /** 최상위 이례성 강도(`anomalies[0].strength`). */
  anomalyStrength?: number;
}

/**
 * 최종 랭킹 점수 — **신규성이 1차 축**이고, 쿨다운과 이례성은 곱셈 보정이다.
 *
 * 곱셈으로 통일한 이유: 세 항이 전부 "이 신호를 얼마나 위로 올릴 것인가" 의 배율이라
 * 덧셈으로 섞으면 스케일이 다른 값끼리 경쟁하게 되고, 어느 항이 순위를 만들었는지 설명이 안 된다.
 *
 * **연속일수는 여기에 들어오지 않는다.** 들어올 자리 자체가 없다(WO 완료조건 3).
 */
export function rankScore(input: RankInput): number {
  return (
    noveltyScore(input.ageDays) *
    page1CooldownFactor(input.page1Streak ?? 0) *
    anomalyMultiplier(input.anomalyStrength)
  );
}

/** 덱 크기에서 파생되는 구성 상·하한(장수). 비율이 정본이고 장수는 계산값이다. */
export function deckCaps(deckSize: number): { minFresh: number; maxSameKind: number; maxPersistent: number } {
  const size = Math.max(0, Math.floor(deckSize));
  return {
    minFresh: Math.ceil(size * MIN_FRESH_RATIO),
    maxSameKind: Math.max(1, Math.floor(size * MAX_SAME_KIND_RATIO)),
    maxPersistent: Math.floor(size * MAX_PERSISTENT_RATIO),
  };
}

/** 구성 대상 최소 정보. 정렬은 호출자가 이미 끝냈다고 본다(점수 내림차순). */
export interface DeckCandidate {
  /** 신호 유형 — 동일 유형 편중 상한의 키. */
  kind: string;
  /** 유효 경과일. */
  ageDays: number;
  /**
   * 인물 카드면 그 인물의 id(WO-RESET-07 §E-2). 아니면 없다.
   * 전체 상한과 **같은 인물 연속 상한**을 이 값으로 건다.
   */
  investorId?: string;
}

/** 구성 규칙 때문에 덱에 못 든 사유. 선반 문구가 이 값을 그대로 번역한다. */
export type DeckSkipReason =
  | "kind_cap"
  | "persistent_cap"
  | "reserved_for_fresh"
  | "deck_full"
  | "shrunk_for_fresh_floor"
  /** 인물 카드가 덱 상한을 채웠다(WO-RESET-07 §E-2). */
  | "investor_cap"
  /** 같은 인물이 이미 상한만큼 들어갔다. */
  | "same_investor_cap";

export interface ComposeResult<T> {
  /** 최종 덱(입력 순서 = 점수 순서 유지). */
  deck: T[];
  /**
   * 항목별 탈락 사유 — 집계(`skipped`)만으로는 **어느 카드가 왜 밀렸는지** 알 수 없다.
   *
   * 선반은 "왜 못 넘었는지까지 그대로 보여준다" 가 존재 이유다. 실측(2026-08-19): 집계만 있어서
   * `kind_cap` 으로 밀린 Gbank 에 「오래된 신호라 뒤로 밀렸어요」(경과일로 추측한 문구)가 붙었다 —
   * 사실이 아닌 사유를 화면에 말한 것이다.
   */
  skipReasons: Map<T, DeckSkipReason>;
  /** 워치에서 승격된 수. */
  promoted: number;
  /** 구성 규칙 때문에 밀린 후보 수(사유별). */
  skipped: Record<string, number>;
  /** 신규 하한을 채우지 못해 덱을 줄인 장수. 0 이면 상한대로 찼다. */
  shrunkBy: number;
  /**
   * **실제로 적용된** 하한·상한 — 요청 덱 크기(`deckSize`) 기준이다.
   *
   * 최종 장수로 다시 계산하지 않는다. 축소가 일어난 경우 그러면 보고값이 실제 덱과 어긋난다
   * (실측 2026-08-18: 10장 기준 동일유형 상한 6으로 골랐는데 9장으로 줄어 `floor(9×0.6)=5` 를
   * 보고해, 덱에 6장 있는 유형을 "상한 5" 라고 말했다). 계측이 거짓말하면 계측이 아니다.
   */
  caps: { minFresh: number; maxSameKind: number; maxPersistent: number };
  version: string;
}

/**
 * 덱 구성 — 점수 상위 N 을 그대로 쓰지 않는다.
 *
 * 규칙(비율 정본, 장수는 `deckCaps` 파생):
 *   신규(≤`FRESH_AGE_DAYS`) 최소 `MIN_FRESH_RATIO`
 *   동일 유형        최대 `MAX_SAME_KIND_RATIO`
 *   지속(>FRESH)     최대 `MAX_PERSISTENT_RATIO`
 *
 * 공급 부족 시: 워치에서 승격 시도 → 그래도 부족하면 **덱 크기를 줄인다.**
 * **지속 신호로 채우지 않는다**(WO 실패 모드).
 */
export function composeDeck<T extends DeckCandidate>(
  ranked: readonly T[],
  options: { deckSize?: number; watchPool?: readonly T[]; today?: string } = {}
): ComposeResult<T> {
  const deckSize = Math.max(0, Math.floor(options.deckSize ?? DECK_SIZE));
  const caps = deckCaps(deckSize);
  const skipped: Record<string, number> = {};
  const skipReasons = new Map<T, DeckSkipReason>();
  const bump = (reason: DeckSkipReason, item?: T) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
    // 첫 사유를 남긴다 — 뒤에 다른 규칙에도 걸렸다고 사유가 바뀌면 설명이 흔들린다.
    if (item !== undefined && !skipReasons.has(item)) skipReasons.set(item, reason);
  };

  const chosen: T[] = [];
  const kindCount = new Map<string, number>();
  let persistent = 0;
  let fresh = 0;

  /**
   * 인물 카드 상한(WO-RESET-07 §E-2) — 13F 시즌엔 60%, 평소엔 40%.
   * 날짜를 안 주면 평소 상한을 쓴다(넓히는 쪽이 아니라 좁히는 쪽으로 틀린다).
   */
  const investorRatio = options.today && is13fSeason(options.today)
    ? MAX_INVESTOR_RATIO_13F_SEASON
    : MAX_INVESTOR_RATIO;
  const maxInvestor = Math.max(1, Math.floor(deckSize * investorRatio));
  const investorCount = new Map<string, number>();
  let investorTotal = 0;

  const take = (item: T): void => {
    chosen.push(item);
    kindCount.set(item.kind, (kindCount.get(item.kind) ?? 0) + 1);
    if (item.investorId) {
      investorTotal += 1;
      investorCount.set(item.investorId, (investorCount.get(item.investorId) ?? 0) + 1);
    }
    if (isFreshSignal(item.ageDays)) fresh += 1;
    else persistent += 1;
  };

  for (const item of ranked) {
    if (chosen.length >= deckSize) { bump("deck_full", item); continue; }
    if ((kindCount.get(item.kind) ?? 0) >= caps.maxSameKind) { bump("kind_cap", item); continue; }
    if (item.investorId) {
      if (investorTotal >= maxInvestor) { bump("investor_cap", item); continue; }
      if ((investorCount.get(item.investorId) ?? 0) >= MAX_SAME_INVESTOR) { bump("same_investor_cap", item); continue; }
    }
    if (!isFreshSignal(item.ageDays)) {
      if (persistent >= caps.maxPersistent) { bump("persistent_cap", item); continue; }
      // 남은 자리가 신규 부족분과 같아지면 그 자리는 신규 몫이다 — 지속으로 선점하지 않는다.
      const remaining = deckSize - chosen.length;
      const freshNeeded = Math.max(0, caps.minFresh - fresh);
      if (remaining <= freshNeeded) { bump("reserved_for_fresh", item); continue; }
    }
    take(item);
  }

  // 신규 하한 미달 → 워치에서 신규만 승격 시도(지속은 승격 대상이 아니다).
  let promoted = 0;
  if (fresh < caps.minFresh) {
    const seen = new Set(chosen);
    for (const item of options.watchPool ?? []) {
      if (fresh >= caps.minFresh || chosen.length >= deckSize) break;
      if (seen.has(item) || !isFreshSignal(item.ageDays)) continue;
      if ((kindCount.get(item.kind) ?? 0) >= caps.maxSameKind) { bump("kind_cap", item); continue; }
      take(item);
      promoted += 1;
    }
  }

  // 그래도 부족하면 덱을 줄인다 — 점수 최하위 지속 신호를 뒤에서 뺀다.
  let shrunkBy = 0;
  while (chosen.length > 0 && fresh < Math.ceil(chosen.length * MIN_FRESH_RATIO)) {
    const lastPersistent = [...chosen].reverse().find((item) => !isFreshSignal(item.ageDays));
    if (!lastPersistent) break; // 지속이 없는데도 미달이면 더 줄일 이유가 없다(전부 신규).
    chosen.splice(chosen.lastIndexOf(lastPersistent), 1);
    persistent -= 1;
    shrunkBy += 1;
    bump("shrunk_for_fresh_floor", lastPersistent);
  }

  // 덱에 든 항목은 사유가 없어야 한다 — 승격 경로에서 한 번 밀렸다가 들어온 경우가 있다.
  for (const item of chosen) skipReasons.delete(item);

  return {
    deck: chosen,
    skipReasons,
    promoted,
    skipped,
    shrunkBy,
    caps, // 적용된 상한 그대로 — 최종 장수로 재계산하지 않는다(위 주석)
    version: DECK_COMPOSITION_VERSION,
  };
}

// ── 1페이지 이력(쿨다운 입력) ──────────────────────────────────────────────
/**
 * 최근 스냅샷들에서 종목별 **1페이지 연속 점유일수**를 센다.
 *
 * `snapshots` 는 **최신 날짜가 먼저** 오도록 정렬돼 있어야 하고, 오늘자는 빠져 있어야 한다
 * (오늘을 넣으면 자기 자신 때문에 감점된다). 연속이 끊기면 그 종목의 카운트는 끝난다.
 */
export function page1StreakFromHistory(
  snapshots: ReadonlyArray<{ page1: readonly string[] }>
): Map<string, number> {
  const streak = new Map<string, number>();
  const first = snapshots[0];
  if (!first) return streak;
  // 연속은 **가장 최근 날에 1페이지에 있던 종목만** 갖는다. 하루라도 비면 현재 연속은 0 이다.
  let alive = new Set(first.page1);
  for (const name of alive) streak.set(name, 1);
  for (const snap of snapshots.slice(1)) {
    const present = new Set(snap.page1);
    const next = new Set<string>();
    for (const name of alive) {
      if (!present.has(name)) continue; // 여기서 끊겼다 — 더 거슬러 올라가지 않는다.
      streak.set(name, (streak.get(name) ?? 0) + 1);
      next.add(name);
    }
    if (next.size === 0) break;
    alive = next;
  }
  return streak;
}
