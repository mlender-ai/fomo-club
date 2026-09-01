/**
 * 모션 감소 설정 — **한 곳에서만 읽는다.**
 *
 * `QuietPickDepth`·`StockSwipeDeck` 이 같은 함수를 각자 갖고 있었다. 같은 값이라도 따로
 * 적으면 따로 흘러간다(DS-07 §0 이 카드에서 겪은 것과 같은 문제다). 세 번째 사본을
 * 만들지 않고 여기로 모은다.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
