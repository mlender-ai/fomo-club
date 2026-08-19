/**
 * CTX-07 INV-C12 — 카드 앞면 텍스트 예산. 순수 함수.
 *
 * ## 어기면 사용자가 무엇을 잘못 믿는가
 *
 * 예산을 넘기면 결론이 3줄로 자라 카드에서 가장 큰 텍스트가 문단이 된다. 그러면 "한 장면에
 * 놀라움 하나"(DS-01 §1)가 깨지고, 사용자는 **결론이 어디까지인지 모른 채** 근거·성적을
 * 결론의 연장으로 읽는다. 이 불변식이 막는 것은 위계 붕괴다.
 *
 * ## 예산 수치의 근거 (감으로 정하지 않았다)
 *
 * DS-01 §3-③·④ 가 정한 값이다. 카드 내용폭 276~285px(375px 뷰포트 · 패딩 16) 기준:
 *
 * | 슬롯 | 폰트 | 줄수 | 줄당 |
 * |---|---|---|---|
 * | 결론(훅) | `display` 24px / lh 1.32 | 2 | 약 14자 |
 * | 근거 한 줄 | `label` 12px mono | 1 | 약 38자 |
 *
 * ## DS-01 이전과 달라진 점
 *
 * 종전 예산은 훅 22px(줄당 19자) · **칩 묶음** 2줄 · **되돌아보는 선** 1줄이었다. DS-01 에서
 * 칩은 근거 한 줄로 합쳐졌고 되돌아보는 선은 상세로 옮겼으므로 두 슬롯은 앞면 예산에서 빠진다.
 * 훅은 폰트가 커져(22→24) 줄당 문자수가 줄었다 — 예산이 조여진 것이다.
 *
 * 발행 덱 실측(2026-08-19) 최대치는 훅 21자 · 근거 34자로 새 예산 안이다. 즉 이 예산은
 * **현재를 통과시키되 퇴화를 막는** 선이다.
 */

export interface CardFrontBudget {
  /** 허용 줄수 — DS-01 블록 스펙에서 온다. */
  lines: number;
  /** 줄당 문자수(실측). */
  charsPerLine: number;
}

/** 슬롯별 예산. 값을 바꾸면 `quietCardLayout` 의 높이 계약도 같이 봐야 한다. */
export const CARD_FRONT_BUDGET = {
  /** 결론 — DS-01 §3-③ "최대 2줄, 줄당 14자 내외". */
  hook: { lines: 2, charsPerLine: 14 },
  /** 근거 한 줄 — DS-01 §3-④. 한 줄이다(두 줄이 되면 항목을 줄인다). */
  evidence: { lines: 1, charsPerLine: 38 },
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
  /** 결론(훅) — 카드에서 가장 큰 텍스트. */
  hook: string;
  /** 근거 한 줄 — 항목을 ` · ` 로 이은 **완성 문자열**. 항목 수가 아니라 줄 길이를 본다. */
  evidence: string;
}

/**
 * 앞면 텍스트 예산 검사. 위반이 없으면 빈 배열.
 *
 * 근거는 항목 **개수**가 아니라 이어 붙인 **줄 길이**를 본다 — 막으려는 것은 개수가 아니라
 * 줄바꿈이다. 항목이 3개라도 짧으면 한 줄이고, 2개라도 길면 두 줄이 된다.
 */
export function checkCardFrontBudget(card: CardFrontText): BudgetViolation[] {
  const out: BudgetViolation[] = [];
  const slots: Array<{ slot: CardFrontSlot; text: string }> = [
    { slot: "hook", text: card.hook ?? "" },
    { slot: "evidence", text: card.evidence ?? "" },
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
