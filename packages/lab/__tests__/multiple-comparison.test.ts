import { describe, expect, it } from "vitest";

import { MIN_SAMPLE, describeMultipleComparison, multipleComparison } from "../src";

function candidate(id: string, sharpe: number | null, years = 3, trades = 100) {
  return { id, label: id, sharpe, years, trades };
}

describe("PART D — 1위가 우연일 확률", () => {
  it("전략이 하나면 단일 p값과 같다", () => {
    const r = multipleComparison([candidate("a", 1.0)]);
    expect(r.tested).toBe(1);
    expect(r.familyP).toBeCloseTo(r.singleP ?? 0, 10);
  });

  it("파라미터 조합도 한 번의 시도다 — 조합을 늘리면 확률이 오른다 (E-2)", () => {
    // 전략 하나를 6조합 돌려 최고를 골랐다면 후보는 6개다.
    const single = multipleComparison([candidate("a", 1.0)]);
    const swept = multipleComparison([
      candidate("a", 1.0),
      ...Array.from({ length: 5 }, (_, i) => candidate(`a#${i}`, 0)),
    ]);
    expect(swept.familyP).toBeGreaterThan(single.familyP ?? 0);
  });

  it("**전략을 많이 돌릴수록 1위를 믿기 어려워진다**", () => {
    const one = multipleComparison([candidate("a", 1.0)]);
    const five = multipleComparison([
      candidate("a", 1.0),
      candidate("b", 0.5),
      candidate("c", 0.4),
      candidate("d", 0.3),
      candidate("e", 0.2),
    ]);
    // 1위 성적이 같아도 함께 검증한 수가 많으면 확률이 커진다.
    expect(five.familyP).toBeGreaterThan(one.familyP ?? 0);
  });

  it("샤프가 높을수록 우연일 확률이 낮아진다", () => {
    const weak = multipleComparison([candidate("a", 0.2)]);
    const strong = multipleComparison([candidate("a", 2.5)]);
    expect(strong.familyP).toBeLessThan(weak.familyP ?? 1);
  });

  it("관측 기간이 길수록 우연일 확률이 낮아진다 — 같은 샤프라도", () => {
    const short = multipleComparison([candidate("a", 1.0, 1)]);
    const long = multipleComparison([candidate("a", 1.0, 5)]);
    expect(long.familyP).toBeLessThan(short.familyP ?? 1);
  });

  it("1위를 샤프로 고른다", () => {
    const r = multipleComparison([candidate("a", 0.5), candidate("b", 1.8), candidate("c", 1.1)]);
    expect(r.best?.id).toBe("b");
  });

  it("확률은 0~1 안이다", () => {
    for (const sharpe of [-3, 0, 0.5, 5]) {
      const r = multipleComparison([candidate("a", sharpe), candidate("b", sharpe)]);
      expect(r.familyP).toBeGreaterThanOrEqual(0);
      expect(r.familyP).toBeLessThanOrEqual(1);
    }
  });
});

describe("표본 규칙 (LAB-00 §7)", () => {
  it(`거래 ${MIN_SAMPLE}건 미만은 검정에서 뺀다`, () => {
    const r = multipleComparison([
      candidate("a", 3.0, 3, MIN_SAMPLE - 1),
      candidate("b", 0.5, 3, 100),
    ]);
    expect(r.tested).toBe(1);
    expect(r.best?.id).toBe("b");
    expect(r.excludedForSample).toBe(1);
  });

  it("전부 표본 부족이면 **null 이다 — 0% 라고 말하지 않는다**", () => {
    const r = multipleComparison([candidate("a", 3.0, 3, 5)]);
    expect(r.tested).toBe(0);
    expect(r.familyP).toBeNull();
    expect(r.best).toBeNull();
  });

  it("샤프가 없으면 검정에서 뺀다", () => {
    expect(multipleComparison([candidate("a", null)]).tested).toBe(0);
  });
});

describe("문장", () => {
  it("지시서 문구 그대로 낸다", () => {
    const text = describeMultipleComparison(multipleComparison([candidate("a", 1.0), candidate("b", 0.5)]));
    expect(text).toContain("후보 2개를 함께 검증했다");
    expect(text).toContain("우연히 좋아 보인다");
    expect(text).toMatch(/1위가 우연일 확률 약 \d+%/);
  });

  it("검정할 게 없으면 **없다고 말한다**", () => {
    const text = describeMultipleComparison(multipleComparison([]));
    expect(text).toContain("검정할 후보가 없다");
    expect(text).not.toMatch(/\d+%/);
  });
});
