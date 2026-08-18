/**
 * CTX-07 INV-C12 — 카드 앞면 텍스트 예산. 순수 함수.
 *
 * ## 어기면 사용자가 무엇을 잘못 믿는가
 *
 * 예산을 넘기면 카드가 세로로 자라고 증거 영역이 스크롤한다. 그러면 **되돌아보는 선(무효선)이
 * 접혀 안 보인다.** 사용자는 "이 픽에는 무효 조건이 없다" 고 읽는다 — 있는데 안 보이는 것을
 * 없다고 믿게 만드는 것이 이 불변식이 막는 오해다.
 *
 * ## 예산 수치의 근거 (감으로 정하지 않았다)
 *
 * 2026-08-19 프로덕션 정규 도메인(375px 뷰포트)에서 실측한 렌더 메트릭이다.
 *
 * | 슬롯 | 폰트 | 줄높이 | 실측 |
 * |---|---|---|---|
 * | 훅 | 22px | 32px | 18자 → 1줄 · 21자 → 2줄 (카드 내용폭 276~285px) → **줄당 약 19자** |
 * | 칩 묶음 | 16px | 24px | 27자 → 1줄 · 34자 → 2줄 → **줄당 약 26자** |
 * | 되돌아보는 선 | 12px | 16px | 관측 최대 37자가 1줄 |
 *
 * 허용 줄수는 높이 계약(`apps/fomo-web/lib/quietCardLayout.ts` 의 `BASE_HEIGHT = 372`)이
 * 이미 감당하는 범위로 잡는다 — 훅 2줄·칩 2줄. 그 이상은 카드를 자라게 하므로 예산 초과다.
 *
 * 발행 덱 9장 실측 최대치는 훅 21자 · 칩 34자 · 되돌아보는 선 37자로 전부 예산 안이다.
 * 즉 이 예산은 **현재를 통과시키되 퇴화를 막는** 선이다. 지금 위반 0건인 것이 성과가 아니라,
 * 역검증(예산 초과 문안 주입 → 실패)을 통과했다는 것이 성과다.
 */

export interface CardFrontBudget {
  /** 허용 줄수 — 높이 계약에서 온다. */
  lines: number;
  /** 줄당 문자수(실측). */
  charsPerLine: number;
}

/** 슬롯별 예산. 값을 바꾸면 `quietCardLayout` 의 높이 계약도 같이 봐야 한다. */
export const CARD_FRONT_BUDGET = {
  hook: { lines: 2, charsPerLine: 19 },
  chips: { lines: 2, charsPerLine: 26 },
  invalidation: { lines: 2, charsPerLine: 37 },
} as const satisfies Record<string, CardFrontBudget>;

export type CardFrontSlot = keyof typeof CARD_FRONT_BUDGET;

export function budgetChars(slot: CardFrontSlot): number {
  const b = CARD_FRONT_BUDGET[slot];
  return b.lines * b.charsPerLine;
}

export interface BudgetViolation {
  slot: CardFrontSlot;
  chars: number;
  limit: number;
  text: string;
}

export interface CardFrontText {
  /** 카드 식별(위반 보고용). */
  subject: string;
  hook: string;
  /** 칩은 개별이 아니라 **묶음 길이**로 본다 — 한 줄에 이어 붙기 때문이다. */
  chips: readonly string[];
  invalidation: string;
}

/**
 * 앞면 텍스트 예산 검사. 위반이 없으면 빈 배열.
 *
 * 칩은 개수가 아니라 총 길이를 본다(구분 공백 포함). 칩 3개가 각각 짧아도 합이 두 줄을
 * 넘기면 카드가 자란다 — 막으려는 것은 개수가 아니라 높이다.
 */
export function checkCardFrontBudget(card: CardFrontText): BudgetViolation[] {
  const out: BudgetViolation[] = [];
  const chipText = card.chips.join(" ");
  const slots: Array<{ slot: CardFrontSlot; text: string }> = [
    { slot: "hook", text: card.hook ?? "" },
    { slot: "chips", text: chipText },
    { slot: "invalidation", text: card.invalidation ?? "" },
  ];
  for (const { slot, text } of slots) {
    const limit = budgetChars(slot);
    if (text.length > limit) out.push({ slot, chars: text.length, limit, text });
  }
  return out;
}

export function cardFrontBudgetOk(card: CardFrontText): boolean {
  return checkCardFrontBudget(card).length === 0;
}
