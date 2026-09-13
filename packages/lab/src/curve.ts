/**
 * LAB-05 PART C — 자산곡선 조각 나누기.
 *
 * > **데이터 구멍: 선을 끊는다. 잇지 않는다.**
 *
 * 끊는 이유가 둘이다:
 *  - **데이터 구멍** — 없는 구간을 이으면 그 사이에 아무 일도 없었던 것처럼 보인다(LAB-00 §7)
 *  - **워크포워드 학습 구간** — 그리지 않는다(하지 말 것 4). 검증 구간 사이가 떨어져 있으면 끊긴다
 *
 * 순수 함수다. 화면이 아니라 여기가 판정한다 — 화면은 조각을 받아 그리기만 한다.
 */

export interface CurvePoint {
  at: Date;
  pct: number;
}

/** 이웃 간격이 중앙값의 이 배를 넘으면 끊긴 것으로 본다. */
export const BREAK_MULTIPLE = 2;

/**
 * 시각 간격이 벌어진 곳에서 자른다.
 *
 * 기준을 **중앙값의 배수**로 잡는다. 봉 주기를 인자로 받지 않으려는 것이다 —
 * 받으면 호출자가 틀린 주기를 넘길 수 있고, 그러면 멀쩡한 선이 조각나거나
 * **구멍이 이어진다.** 데이터가 스스로 말하게 둔다.
 *
 * ## 한계 — 구멍이 소수일 때만 성립한다
 *
 * 간격의 절반 이상이 구멍이면 중앙값이 구멍 위에 앉아 일부를 놓친다.
 * 실제 자산곡선은 점이 수천 개고 구멍은 몇 개라 그 상황이 오지 않지만,
 * 한계를 알고 쓰는 것과 모르고 쓰는 것은 다르다(`curve.test.ts` 가 이 성질을 박아뒀다).
 */
export function splitCurveSegments(
  points: readonly CurvePoint[],
  breakMultiple = BREAK_MULTIPLE
): CurvePoint[][] {
  if (points.length === 0) return [];
  if (points.length === 1) return [[points[0] as CurvePoint]];

  const deltas: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    deltas.push((points[i] as CurvePoint).at.getTime() - (points[i - 1] as CurvePoint).at.getTime());
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  // 간격을 못 재면(전부 같은 시각) 자르지 않는다. 모르면 그대로 둔다.
  if (!(median > 0)) return [[...points]];
  const threshold = median * breakMultiple;

  const segments: CurvePoint[][] = [];
  let current: CurvePoint[] = [points[0] as CurvePoint];
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i] as CurvePoint;
    if ((deltas[i - 1] as number) > threshold) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
