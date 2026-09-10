import { describe, expect, it } from "vitest";
import {
  buildWhyNowRows,
  WHY_NOW_DISCLAIMER,
  WHY_NOW_FORBIDDEN,
  WHY_NOW_MIN_AXES,
  WHY_NOW_MIN_WIN_RATE,
  type WhyNowInput,
} from "../src/keyword-cards/why-now";

const band = (percentile: number, current = 0.36, sufficient = true) => ({
  label: "PBR",
  current,
  percentile,
  sufficient,
});

/** 휴니드 실측 — WO-HOOK-02 §1 이 "재료는 이미 화면에 있다"의 예로 든 종목. */
const huneed: WhyNowInput = {
  band: band(1),
  eps: -378,
  pctAboveYearLow: 27.4,
  signalStats: { n: 50, up: 26, winRate: 52 },
};

describe("buildWhyNowRows — 축 구성", () => {
  it("휴니드 실측 재료가 네 줄로 모인다 (§1)", () => {
    expect(buildWhyNowRows(huneed)).toEqual([
      { axis: "값", text: "PBR 0.36배 — 5년 중 가장 낮은 구간이에요" },
      { axis: "손익", text: "적자 구간이라 이익으로는 값을 잴 수 없어요" },
      { axis: "가격", text: "52주 저점에서 27% 위예요" },
      { axis: "이력", text: "비슷한 신호 50번 중 26번 올랐어요 (52%)" },
    ]);
  });

  it("축 순서는 고정이다 — 종목마다 순서가 달라지면 매번 다시 읽어야 한다", () => {
    const rows = buildWhyNowRows(huneed);
    expect(rows.map((r) => r.axis)).toEqual(["값", "손익", "가격", "이력"]);
  });

  it("이력은 분모와 분자를 같이 쓴다 — 52% 만으로는 무엇의 52% 인지 모른다", () => {
    const rows = buildWhyNowRows({ eps: 100, signalStats: { n: 50, up: 26, winRate: 52 } });
    const history = rows.find((r) => r.axis === "이력");
    expect(history?.text).toContain("50번 중 26번");
    expect(history?.text).toContain("(52%)");
  });

  it("저점 정보가 없으면 고점 대비를 쓴다", () => {
    const rows = buildWhyNowRows({ eps: -1, pctBelowYearHigh: 41.2 });
    expect(rows.find((r) => r.axis === "가격")?.text).toBe("52주 고점 대비 41% 아래예요");
  });

  it("저점·고점이 둘 다 있으면 저점 쪽 하나만 쓴다", () => {
    const rows = buildWhyNowRows({ eps: -1, pctAboveYearLow: 27, pctBelowYearHigh: 41 });
    expect(rows.filter((r) => r.axis === "가격")).toHaveLength(1);
    expect(rows.find((r) => r.axis === "가격")?.text).toContain("저점");
  });
});

describe("2축 규칙 (§2-2) — 답하는 시늉을 하지 않는다", () => {
  it("1축이면 빈 배열 — 섹션 자체를 만들지 않는다", () => {
    expect(buildWhyNowRows({ eps: -378 })).toEqual([]);
    expect(buildWhyNowRows({ pctAboveYearLow: 27 })).toEqual([]);
  });

  it("재료가 하나도 없으면 빈 배열", () => {
    expect(buildWhyNowRows({})).toEqual([]);
  });

  it("정확히 2축이면 표시한다", () => {
    const rows = buildWhyNowRows({ eps: -378, pctAboveYearLow: 27 });
    expect(rows).toHaveLength(WHY_NOW_MIN_AXES);
  });
});

describe("밴드가 불충분하면 밴드 얘기를 하지 않는다 (완료 기준 11)", () => {
  it("sufficient=false 면 값 축이 없다", () => {
    const rows = buildWhyNowRows({ band: band(1, 0.36, false), eps: -378, pctAboveYearLow: 27 });
    expect(rows.some((r) => r.axis === "값")).toBe(false);
    expect(rows.every((r) => !r.text.includes("5년"))).toBe(true);
  });

  it("백분위가 없으면 값 축이 없다", () => {
    const rows = buildWhyNowRows({
      band: { label: "PBR", current: 0.36, percentile: null, sufficient: true },
      eps: -378,
      pctAboveYearLow: 27,
    });
    expect(rows.some((r) => r.axis === "값")).toBe(false);
  });
});

describe("밴드 구간 표현", () => {
  const at = (p: number) => buildWhyNowRows({ band: band(p), eps: -1 }).find((r) => r.axis === "값")?.text;

  it("백분위 구간별로 표현이 갈린다", () => {
    expect(at(1)).toContain("가장 낮은 구간");
    expect(at(25)).toContain("낮은 편");
    expect(at(50)).toContain("평균 근처");
    expect(at(85)).toContain("높은 편");
    expect(at(99)).toContain("가장 높은 구간");
  });
});

describe("표현 규칙 (§2-3) — 인과 단정·평가·예측 금지", () => {
  /** 축 조합을 넓게 훑어 생성 가능한 문장을 전부 만든다. */
  const allTexts = (): string[] => {
    const out: string[] = [];
    for (const p of [0, 1, 25, 50, 70, 85, 99, 100]) {
      for (const eps of [-378, -1, 0, 1, 5000]) {
        for (const low of [0, 27.4, 233]) {
          for (const stats of [undefined, { n: 50, up: 26, winRate: 52 }, { n: 3, up: 0, winRate: 0 }]) {
            out.push(
              ...buildWhyNowRows({
                band: band(p),
                eps,
                pctAboveYearLow: low,
                ...(stats ? { signalStats: stats } : {}),
              }).map((r) => r.text)
            );
          }
        }
      }
    }
    for (const high of [5, 41.2, 90]) out.push(...buildWhyNowRows({ eps: -1, pctBelowYearHigh: high }).map((r) => r.text));
    return out;
  };

  it("생성 가능한 모든 문장에 금지 표현이 없다", () => {
    const texts = allTexts();
    expect(texts.length).toBeGreaterThan(50);
    for (const text of texts) {
      expect(WHY_NOW_FORBIDDEN.test(text), `금지 표현: ${text}`).toBe(false);
    }
  });

  it("모든 문장이 해요체다 — 단정형 종결을 쓰지 않는다", () => {
    for (const text of allTexts()) {
      // 끝의 괄호 보조(`(52%)`)는 문장이 아니라 수치 병기다 — 종결어미 판정에서 뗀다.
      const ending = text.replace(/\s*\([^)]*\)$/, "").trim();
      expect(/(예요|에요|어요)$/.test(ending), `해요체 아님: ${text}`).toBe(true);
    }
  });

  it("꼬리표가 한계를 명시한다 — 왜 샀는지는 모른다", () => {
    expect(WHY_NOW_DISCLAIMER).toContain("함께 관측된");
    expect(WHY_NOW_DISCLAIMER).toContain("확인할 수 없어요");
    expect(WHY_NOW_FORBIDDEN.test(WHY_NOW_DISCLAIMER)).toBe(false);
  });
});

/**
 * 2026-08-24 실측(한글과컴퓨터) 회귀 — 「왜 지금 사는가」에 47% 가 앉아 있었다.
 * 동전 던지기보다 낮은 승률은 사는 이유가 아니라 반대 증거다.
 */
describe("이력 축 — 승률 하한", () => {
  const twoAxes = { eps: 120, pctAboveYearLow: 16 } as const;
  const axisOf = (rows: ReturnType<typeof buildWhyNowRows>) => rows.map((r) => r.axis);

  it("승률 50% 미만이면 이력 축을 쓰지 않는다 (79번 중 37번 = 47%)", () => {
    const rows = buildWhyNowRows({ ...twoAxes, signalStats: { n: 79, up: 37, winRate: 46.8 } });
    expect(axisOf(rows)).not.toContain("이력");
    // 나머지 축은 그대로 — 섹션을 통째로 죽이는 게 아니다.
    expect(axisOf(rows)).toEqual(["손익", "가격"]);
  });

  it("승률 50% 이상이면 분모·분자와 함께 쓴다", () => {
    const rows = buildWhyNowRows({ ...twoAxes, signalStats: { n: 79, up: 45, winRate: 57.0 } });
    const history = rows.find((r) => r.axis === "이력");
    expect(history?.text).toBe("비슷한 신호 79번 중 45번 올랐어요 (57%)");
  });

  it("경계 50% 는 쓴다 — 하한은 '미만'이다", () => {
    const rows = buildWhyNowRows({ ...twoAxes, signalStats: { n: 10, up: 5, winRate: WHY_NOW_MIN_WIN_RATE } });
    expect(axisOf(rows)).toContain("이력");
  });
});
