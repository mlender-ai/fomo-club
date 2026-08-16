/**
 * 픽 카드 높이 계약 (WO-SUB-HOOK PART 2-3 · D5).
 *
 * ## 무엇이 문제였나
 *
 * 덱 무대가 `h-[540px]` 고정이었다. 카드는 `absolute inset-0` 이라 슬롯 ②③ 을 못 받은 종목도
 * 540px 를 그대로 차지했고, 실측에서 카드 중앙 약 35%가 빈 채로 남았다. 6주 전 지적이
 * 그대로 남아 있던 이유는 "빈 슬롯을 안 그리기"만 고치고 **무대 높이**를 안 고쳤기 때문이다.
 * 조건부 렌더는 이미 맞았다 — 자리를 비워둔 것은 컨테이너였다.
 *
 * ## 이 모듈이 하는 일
 *
 * 슬롯 조합 → 카드 최소 높이(px). 카드가 이 값을 `minHeight` 로 쓰고, 무대는 고정 높이를
 * 버리고 카드 높이를 따라간다. 조합이 다르면 **높이가 실제로 달라진다**(스냅샷 4종으로 고정).
 *
 * 최소 높이지 고정 높이가 아니다. 내용이 더 길면 카드가 더 자라고, 그때만 증거 영역이
 * 스크롤한다(되돌아보는 선·푸터는 스크롤 밖에 있어야 하므로).
 */

export interface QuietCardSlots {
  /** ② 실체 — 어디서 돈을 버는가 한 줄. */
  substance: boolean;
  /**
   * ③ 값의 위치 — **앞면에서 제거됨**(WO-RENDER-01 E-1). 디테일로 옮겼다.
   * 필드는 호출부 호환을 위해 남기되 **높이에 기여하지 않는다** — 앞면에 없는 블록이
   * 높이를 차지하면 그만큼 빈 공간이 남는다(CTX-05 §2-3).
   */
  valuation: boolean;
  /** "이런 신호, 과거엔 어땠나" 블록. */
  signalStats: boolean;
}

/** ① 만 있는 카드의 바닥값 — 헤더·가격·훅·칩·스파크라인·되돌아보는 선·푸터. */
const BASE_HEIGHT = 372;

/** 슬롯별 실제 차지 높이(마진 포함). 값을 바꾸면 스냅샷이 깨진다 — 의도한 변경만 통과시킨다. */
const SLOT_HEIGHT: Record<keyof QuietCardSlots, number> = {
  signalStats: 74,
  substance: 32,
  // 앞면에서 뺐으므로 0. 값만 남겨 계약이 어디서 바뀌었는지 보이게 한다.
  valuation: 0,
};

/**
 * 이 조합에서 카드가 가져야 할 최소 높이(px).
 * ①만 372 · ①② 404. ③(값의 위치)은 앞면에서 빠져 높이를 바꾸지 않는다(E-1).
 */
export function quietCardMinHeight(slots: QuietCardSlots): number {
  let height = BASE_HEIGHT;
  for (const key of Object.keys(SLOT_HEIGHT) as Array<keyof QuietCardSlots>) {
    if (slots[key]) height += SLOT_HEIGHT[key];
  }
  return height;
}

/** 카드가 실제로 그리는 블록 목록(위계 순서). 없는 슬롯은 **목록에서 빠진다** — 자리표시자 없음. */
export function quietCardBlocks(slots: QuietCardSlots): string[] {
  return [
    "identity",
    "price",
    "hook",
    "chips",
    ...(slots.signalStats ? ["signalStats"] : []),
    "sparkline",
    ...(slots.substance ? ["substance"] : []),
    "recheckLine",
  ];
}
