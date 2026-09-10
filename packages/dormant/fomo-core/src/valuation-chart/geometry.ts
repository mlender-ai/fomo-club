import type { ChartLinePoint } from "./types";

/**
 * 배수 선의 `null` 구간을 **끊어서** 여러 조각으로 나눈다 (WO-SUB-04 완료 조건 4).
 *
 * 보간하지 않는다 — 적자 구간의 PER 은 존재하지 않으므로 앞뒤를 이어 붙이면
 * "그때도 이익이 있었다"는 거짓말이 된다. 값이 없는 구간은 **선이 없는 것이 사실**이다.
 *
 * 렌더러가 아니라 여기 있는 이유: 차트 라이브러리 대부분이 자동 보간하므로 이 규칙을
 * 그리는 쪽에 맡길 수 없다. 순수 함수로 두고 테스트로 고정한다.
 *
 * 원래 인덱스를 유지한다 — 앞으로 당겨 붙이면 x 축 위치가 어긋난다.
 */
export function lineSegments(
  points: readonly Pick<ChartLinePoint, "value">[]
): Array<Array<{ index: number; value: number }>> {
  const segments: Array<Array<{ index: number; value: number }>> = [];
  let current: Array<{ index: number; value: number }> = [];
  for (const [index, point] of points.entries()) {
    if (point.value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push({ index, value: point.value });
  }
  if (current.length > 0) segments.push(current);
  // 점 하나짜리 조각도 남긴다 — 렌더러가 점으로 찍는다(있는 관측을 버리지 않는다).
  return segments;
}
