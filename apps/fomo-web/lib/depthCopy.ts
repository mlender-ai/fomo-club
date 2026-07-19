/**
 * 뎁스 근거 서술화(WO-22) — "RSI 39" 식 숫자 단독 나열 금지.
 * 밴드 의미를 결정론으로 병기한다. 지표 관례의 사실 서술만 — 판단·예측·매매 지시 아님.
 */

export function describeRsi(rsi: number): string {
  const v = Math.round(rsi);
  if (v >= 70) return `RSI ${v} — 단기 과열 영역(70 이상은 과열로 읽는 게 관례)`;
  if (v >= 60) return `RSI ${v} — 상승 탄력이 붙은 구간`;
  if (v >= 45) return `RSI ${v} — 중립 구간(과열도 과매도도 아님)`;
  if (v >= 30) return `RSI ${v} — 눌린 편이지만 과매도까진 아님`;
  return `RSI ${v} — 과매도 영역(30 미만, 많이 눌린 상태)`;
}

/** gap = 52주 고점 대비 하락률(%) 양수. */
export function describe52wGap(gap: number): string {
  if (gap <= 0.5) return "52주 고점권 — 1년 최고가 부근";
  if (gap <= 10) return `52주 고점 대비 -${gap}% — 고점 부근에서 살짝 쉬는 자리`;
  if (gap <= 30) return `52주 고점 대비 -${gap}% — 고점에서 조정이 진행된 자리`;
  return `52주 고점 대비 -${gap}% — 고점 대비 깊게 내려온 자리`;
}
