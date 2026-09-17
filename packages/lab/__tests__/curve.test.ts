import { describe, expect, it } from "vitest";

import { splitCurveSegments } from "../src";

const H = 3600_000;
const T0 = Date.UTC(2026, 0, 1);

function pt(hour: number, pct = 0) {
  return { at: new Date(T0 + hour * H), pct };
}

describe("완료확인 8 — 데이터 구멍에서 선이 끊긴다", () => {
  it("끊김이 없으면 한 조각이다", () => {
    expect(splitCurveSegments([pt(0), pt(1), pt(2), pt(3)])).toHaveLength(1);
  });

  it("구멍이 있으면 조각이 나뉜다 — **잇지 않는다**", () => {
    const segments = splitCurveSegments([pt(0), pt(1), pt(20), pt(21)]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveLength(2);
    expect(segments[1]).toHaveLength(2);
  });

  it("구멍이 여럿이면 조각도 여럿이다", () => {
    // 정상 간격이 다수인 현실적 입력 — 사이에 구멍 둘.
    const points = [
      ...Array.from({ length: 10 }, (_, i) => pt(i)),
      ...Array.from({ length: 10 }, (_, i) => pt(50 + i)),
      ...Array.from({ length: 10 }, (_, i) => pt(200 + i)),
    ];
    expect(splitCurveSegments(points)).toHaveLength(3);
  });

  it("**구멍이 소수일 때만 성립한다** — 중앙값 기준의 한계다", () => {
    // 간격 4개 중 2개가 구멍이면 중앙값이 구멍 위에 앉아 하나만 끊긴다.
    // 실제 자산곡선은 점이 수천 개고 구멍은 몇 개라 이 상황이 오지 않는다.
    // 그래도 한계를 알고 쓰는 것과 모르고 쓰는 것은 다르므로 적어둔다.
    expect(splitCurveSegments([pt(0), pt(1), pt(50), pt(51), pt(200)])).toHaveLength(2);
  });

  it("정상 간격 하나를 건너뛴 정도로는 안 끊는다 — 잡음에 조각나지 않는다", () => {
    // 1시간 간격에 2시간 하나. 중앙값 1시간 × 2 = 2시간 임계이므로 안 끊긴다.
    expect(splitCurveSegments([pt(0), pt(1), pt(3), pt(4)])).toHaveLength(1);
  });

  it("임계를 넘기면 끊는다", () => {
    expect(splitCurveSegments([pt(0), pt(1), pt(4), pt(5)])).toHaveLength(2);
  });

  it("점이 하나면 조각 하나다", () => {
    expect(splitCurveSegments([pt(0)])).toHaveLength(1);
  });

  it("비면 조각이 없다", () => {
    expect(splitCurveSegments([])).toEqual([]);
  });

  it("간격을 못 재면 자르지 않는다 — 모르면 그대로 둔다", () => {
    expect(splitCurveSegments([pt(0), pt(0), pt(0)])).toHaveLength(1);
  });

  it("조각을 합치면 원래 점 수와 같다 — **점을 잃지 않는다**", () => {
    const points = [pt(0), pt(1), pt(30), pt(31), pt(32), pt(90)];
    const total = splitCurveSegments(points).reduce((n, s) => n + s.length, 0);
    expect(total).toBe(points.length);
  });
});
