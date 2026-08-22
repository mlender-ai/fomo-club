/**
 * 메인 카드 블록 계약 (WO-HOOK-01 §3 — DS-01 §2·§5 를 대체).
 *
 * ## 고정 높이도, 최소 높이도 없다
 *
 * 한때 이 모듈은 슬롯 조합 → **최소 높이(px)** 를 돌려줬다(`quietCardMinHeight`, BASE_HEIGHT 372).
 * 최소 높이는 "블록이 빠졌는데도 카드가 그만큼 차지하는" 공백을 만든다 — §3 이 금지하는 바로
 * 그것이다. 그래서 높이 계약을 삭제했다. 카드 높이는 내용이 정한다.
 *
 * 남은 계약은 **어떤 블록이 그려지는가**뿐이다. 없는 블록은 목록에서 빠진다 — 자리표시자 없음.
 *
 * ## DS-01 에서 달라진 목록
 *
 * `evidence`(근거 박스)·`ourRecord`(우리 성적)가 빠지고 `figure`(형별 그림)·`support`(보조 2줄)가
 * 들어왔다. 우리 성적은 지운 게 아니라 상세로 갔다(§7-1) — accent 가 두 곳이 되고, 마스킹된
 * 카드에서 "짚은 뒤" 문구가 종목 정체를 암시하기 때문이다.
 */

export interface QuietCardBlockInput {
  /** ④ 형별 그림 — 재료가 없으면 그리지 않는다(A 누적선 / B 큰 숫자 / C 막대). */
  figure: boolean;
  /** ⑤ 보조 — 최대 2줄. 한 줄도 없으면 그리지 않는다. */
  support: boolean;
  /** ⑥ CTA — 상세로 갈 수 있을 때만. */
  cta: boolean;
}

/**
 * 이 입력에서 카드가 실제로 그리는 블록 목록(위→아래).
 *
 * ①②③ 은 항상 있다 — 정체·가격·후킹이 없으면 카드가 성립하지 않는다.
 * §8 에서 상세로 내려간 것들(되돌아보는 선·회사 설명·매출 막대·경고문·우리 성적)은 여기 없다.
 * **옮긴 것이지 지운 것이 아니다** — `QuietPickDepth` 가 그린다.
 */
export function quietCardBlocks(input: QuietCardBlockInput): string[] {
  return [
    "identity",
    "price",
    "hook",
    ...(input.figure ? ["figure"] : []),
    ...(input.support ? ["support"] : []),
    ...(input.cta ? ["cta"] : []),
  ];
}
