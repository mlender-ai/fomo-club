/**
 * 메인 카드 블록 계약 (DS-01 §2·§5).
 *
 * ## 고정 높이도, 최소 높이도 없다
 *
 * 종전 이 모듈은 슬롯 조합 → **최소 높이(px)** 를 돌려줬다(`quietCardMinHeight`, BASE_HEIGHT 372).
 * 최소 높이는 "블록이 빠졌는데도 카드가 그만큼 차지하는" 공백을 만든다 — DS-01 §5 가 금지하는
 * 바로 그것이다. 그래서 높이 계약을 **삭제했다.** 카드 높이는 내용이 정한다.
 *
 * 남은 계약은 **어떤 블록이 그려지는가**뿐이다. 없는 블록은 목록에서 빠진다 — 자리표시자 없음.
 */

export interface QuietCardBlockInput {
  /** ④ 근거 한 줄 — 실수치/칩이 하나도 없으면 그리지 않는다. */
  evidence: boolean;
  /** ⑤ 스파크라인 — 20포인트 미만이면 그리지 않는다(DS-01 §3-⑤). */
  sparkline: boolean;
  /** ⑥ 우리 성적 — 이전 발행 기록이 있을 때만. 없으면 카드에 accent 가 없다. */
  ourRecord: boolean;
  /** ⑦ CTA — 상세로 갈 수 있을 때만. */
  cta: boolean;
}

/**
 * 이 입력에서 카드가 실제로 그리는 블록 목록(위→아래).
 *
 * ①②③ 은 항상 있다 — 종목·가격·결론이 없으면 카드가 성립하지 않는다.
 * DS-01 §4 에서 상세로 내려간 것들(되돌아보는 선·매출 막대·회사 설명·신호 과거 성적·재등장 사유)은
 * 여기 없다. **옮긴 것이지 지운 것이 아니다** — `QuietPickDepth` 가 그린다.
 */
export function quietCardBlocks(input: QuietCardBlockInput): string[] {
  return [
    "identity",
    "price",
    "hook",
    ...(input.evidence ? ["evidence"] : []),
    ...(input.sparkline ? ["sparkline"] : []),
    ...(input.ourRecord ? ["ourRecord"] : []),
    ...(input.cta ? ["cta"] : []),
  ];
}
