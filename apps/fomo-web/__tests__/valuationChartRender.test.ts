import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lineSegments } from "@fomo/core";

/**
 * 값의 상태 차트 렌더 가드 (WO-SUB-04).
 *
 * 렌더 규칙 중 **소스에서 판정 가능한 것**을 고정한다. 데이터 층 검사는
 * `packages/fomo-core/__tests__/valuation-chart.test.ts` 가 맡는다.
 */

const SOURCE = readFileSync(join(__dirname, "..", "components", "ValuationChart.tsx"), "utf8");

describe("배수 선은 null 구간에서 끊긴다 (완료 조건 4)", () => {
  it("중간이 null 이면 두 조각으로 나뉜다 — 이어 붙이지 않는다", () => {
    const segments = lineSegments([{ value: 10 }, { value: 12 }, { value: null }, { value: 9 }, { value: 8 }]);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.map((p) => p.value)).toEqual([10, 12]);
    expect(segments[1]!.map((p) => p.value)).toEqual([9, 8]);
  });

  it("끊긴 뒤의 조각도 원래 x 위치를 유지한다 — 앞으로 당겨 붙이지 않는다", () => {
    const segments = lineSegments([{ value: 1 }, { value: null }, { value: 3 }]);
    expect(segments[1]![0]!.index).toBe(2);
  });

  it("전부 null 이면 조각이 없다", () => {
    expect(lineSegments([{ value: null }, { value: null }])).toEqual([]);
  });

  it("관측이 하나뿐이어도 버리지 않는다(점으로 남는다)", () => {
    const segments = lineSegments([{ value: null }, { value: 5 }, { value: null }]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(1);
  });

  it("적자 구간 시나리오 — 앞뒤가 끊긴 채 그려진다", () => {
    // PER 은 적자 구간에 존재하지 않는다. 보간하면 "그때도 이익이 있었다"는 거짓말이 된다.
    const per = [{ value: 22 }, { value: null }, { value: null }, { value: 15 }];
    const segments = lineSegments(per);
    expect(segments).toHaveLength(2);
    expect(segments.flat()).toHaveLength(2);
  });
});

describe("렌더 규칙", () => {
  it("renderable=false 면 영역 자체를 감춘다 — 빈 박스로 남기지 않는다 (완료 조건 2)", () => {
    expect(SOURCE).toMatch(/if \(!data\.renderable[^)]*\) return null;/);
  });

  it("경고문을 캡션 하단에 부착한다 (INV-11)", () => {
    expect(SOURCE).toContain("data.warning");
  });

  it("경고문·캡션 문안을 컴포넌트에 하드코딩하지 않는다 — 독트린에서 온 값만 렌더한다", () => {
    // 문안이 코드에 있으면 독트린과 두 벌이 되어 반드시 어긋난다.
    for (const phrase of ["저평가", "고평가", "저렴", "매력", "싸다", "비싸다"]) {
      expect(SOURCE).not.toContain(phrase);
    }
  });

  it("차트 라이브러리를 쓰지 않는다 — 자동 보간하는 라이브러리는 이 WO 에 부적합하다", () => {
    for (const lib of ["recharts", "chart.js", "d3", "victory", "nivo"]) {
      expect(SOURCE.toLowerCase()).not.toContain(`from "${lib}`);
    }
  });

  it("예상 막대는 실적과 다른 불투명도로 그린다", () => {
    expect(SOURCE).toContain('bar.kind === "estimate"');
  });

  it("차트를 감싸는 쪽도 renderable 을 보고 컨테이너째 감춘다", () => {
    // 컴포넌트가 null 을 돌려줘도 감싸는 박스를 그대로 두면 **빈 상자가 남는다** —
    // 완료 조건 2 가 금지하는 모양이 정확히 그것이다(실측: 첫 프리뷰에서 그렇게 남았다).
    const preview = readFileSync(
      join(__dirname, "..", "app", "valuation-chart-preview", "page.tsx"),
      "utf8"
    );
    expect(preview).toMatch(/\.renderable &&/);
  });
});
