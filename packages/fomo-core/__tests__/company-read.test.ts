import { describe, it, expect } from "vitest";
import { companyRead, earningsGroup, valueGroup, debtGroup, type CompanyReadInput } from "../src/keyword-cards/company-read";
import type { SectorStat } from "../src/keyword-cards/sector-stats";

const sector: SectorStat = {
  per: 18, pbr: 1.4, debtToEquity: 80, dividendYield: 1.2,
  members: 12, level: "industry", label: "제약",
};

const base: CompanyReadInput = {
  growth: { revenueYoy: 8, revenueCagr3y: 6, operatingIncomeYoy: 22 },
  margin: { operatingTtm: 9 },
  valuation: { per: 12.25, pbr: 0.88, perBand: null, pbrBand: null },
  balance: { debtToEquity: 42 },
  sector,
};

describe("모든 숫자 옆에 비교 문장이 있다 — WO 완료 확인 7", () => {
  it("어떤 줄도 비교 문장 없이 나가지 않는다", () => {
    for (const g of companyRead(base)) for (const r of g.rows) {
      expect(r.comparison.trim().length).toBeGreaterThan(0);
    }
  });

  it("비교 기준이 없으면 그 숫자를 아예 안 보여준다 — 맨숫자 금지", () => {
    const noBasis = { ...base, sector: null, valuation: { per: 12.25, pbr: 0.88, perBand: null, pbrBand: null } };
    expect(valueGroup(noBasis).rows).toEqual([]);
    expect(debtGroup(noBasis).rows).toEqual([]);
  });

  it("업종이 없어도 5년 밴드가 있으면 쓴다 (WO §4-3 우선순위 ②)", () => {
    const band = {
      ...base, sector: null,
      valuation: { per: 12.25, pbr: 0.88, perBand: { percentile: 15, sufficient: true }, pbrBand: null },
    };
    const rows = valueGroup(band).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.comparison).toBe("최근 5년 중 낮은 편이에요");
  });

  it("표본이 모자란 밴드는 안 쓴다 — 못 잰 것을 잰 것처럼 쓰지 않는다", () => {
    const bad = {
      ...base, sector: null,
      valuation: { per: 12.25, pbr: null, perBand: { percentile: 15, sufficient: false }, pbrBand: null },
    };
    expect(valueGroup(bad).rows).toEqual([]);
  });
});

describe("세 덩어리 · 종합 점수 없음 — 완료 확인 8·10", () => {
  it("질문 세 개로 묶인다", () => {
    expect(companyRead(base).map((g) => g.title)).toEqual(["돈은 잘 버나요", "값은 어떤가요", "빚은 괜찮나요"]);
  });

  it("합친 점수를 만들지 않는다 — 덩어리마다 따로", () => {
    const groups = companyRead(base);
    expect(groups.every((g) => typeof g.score === "number")).toBe(true);
    expect(Object.keys(groups[0]!)).not.toContain("total");
  });

  /**
   * FIX-01 B — **이 규약을 뒤집는다.** 종전 규약(「점이 있으면 문장이 반드시 있다」)이
   * 실측 화면에 같은 말을 두 번 쓰게 만들었다:
   *
   *     PBR 2.79배
   *     최근 5년 중 높은 쪽이에요        ← 줄 설명
   *     ●○○○○ 최근 5년 중 높은 편이에요  ← 점 설명
   *
   * 이제 점 옆 문장은 **줄이 말하지 않은 사실**일 때만 있다.
   */
  it("[FIX-01 B] 점 옆 문장은 줄과 겹치면 없다 — 점은 그림으로 혼자 선다", () => {
    for (const g of companyRead(base)) {
      if (g.scoreText === null) continue;
      // 남아 있는 문장은 어느 줄도 하지 않은 말이어야 한다.
      for (const r of g.rows) expect(g.scoreText).not.toBe(r.comparison);
    }
    // 정상 종목(적자 아님)에서는 세 덩어리 모두 점만 남는다.
    expect(companyRead(base).map((g) => g.scoreText)).toEqual([null, null, null]);
  });

  it("[FIX-01 C] 요약 문장은 항상 주어가 있다 — 형용사만 남기지 않는다", () => {
    const subjects = /^(매출|영업이익|PER|PBR|값|빚|지금은)/;
    for (const g of companyRead(base)) {
      if (!g.summaryText) continue;
      expect(g.summaryText, g.title).toMatch(subjects);
    }
  });

  it("계산 방법을 항상 밝힌다 — `어떻게 계산했나요`가 읽을 값", () => {
    for (const g of companyRead(base)) expect(g.method.trim().length).toBeGreaterThan(0);
  });

  it("줄도 점도 없는 덩어리는 빼고 낸다 — 빈 칸을 만들지 않는다", () => {
    const empty: CompanyReadInput = {
      growth: { revenueYoy: null, revenueCagr3y: null, operatingIncomeYoy: null },
      margin: { operatingTtm: null },
      valuation: { per: null, pbr: null, perBand: null, pbrBand: null },
      balance: { debtToEquity: null },
      sector: null,
    };
    expect(companyRead(empty)).toEqual([]);
  });
});

describe("적자 회사 — WO §4-4", () => {
  const loss: CompanyReadInput = {
    ...base,
    margin: { operatingTtm: -5 },
    growth: { revenueYoy: 3, revenueCagr3y: null, operatingIncomeYoy: -40 },
    valuation: { per: 300, pbr: 1.0, perBand: null, pbrBand: null },
  };

  it("이익으로 값을 재지 않는다 — PER 줄이 없다", () => {
    expect(valueGroup(loss).rows.map((r) => r.label)).toEqual(["PBR"]);
  });

  it("[FIX-01 G] 적자 사실이 **줄로** 화면에 선다 — 점수 재료를 숨기지 않는다", () => {
    const g = earningsGroup(loss);
    const margin = g.rows.find((r) => r.label === "영업이익률");
    expect(margin, "영업이익률 줄이 없다 — 흑자 여부가 점수에만 들어간다").toBeTruthy();
    expect(margin!.comparison).toBe("지금은 영업에서 적자예요");
    // 점 옆에 되풀이하지 않는다(B) — 줄이 이미 말했다.
    expect(g.scoreText).toBeNull();
  });

  it("적자라고 말한다 — 이익으로 못 재는 사실은 줄에 없으므로 점 옆에 남는다", () => {
    expect(valueGroup(loss).scoreText).toContain("적자라서 이익으로는 값을 잴 수 없어요");
    // 4걸음 요약에서도 적자가 방향보다 먼저다 — 한 덩어리에 한 줄뿐이므로.
    expect(earningsGroup(loss).summaryText).toBe("지금은 영업에서 적자예요");
  });
});

describe("부채비율은 업종 없이 판정하지 않는다", () => {
  it("업종 중간값이 없으면 점이 없다 — 절대 기준을 만들면 반드시 틀린다", () => {
    const g = debtGroup({ ...base, sector: null });
    expect(g.score).toBeNull();
    expect(g.rows).toEqual([]);
  });

  it("업종보다 빚이 적으면 점이 높다 — 절대값이 아니라 비율로 본다", () => {
    // 업종 중간값 80% 기준: 절반 이하 → 5점, 두 배 넘음 → 1점.
    expect(debtGroup({ ...base, balance: { debtToEquity: 30 } }).score).toBe(5);
    expect(debtGroup({ ...base, balance: { debtToEquity: 42 } }).score).toBe(4);
    expect(debtGroup({ ...base, balance: { debtToEquity: 80 } }).score).toBe(3);
    expect(debtGroup({ ...base, balance: { debtToEquity: 200 } }).score).toBe(1);
  });

  it("같은 부채비율도 업종이 다르면 점이 다르다 — 은행과 소프트웨어를 같은 자로 재지 않는다", () => {
    const heavy = { ...sector, debtToEquity: 400, label: "은행" };
    const light = { ...sector, debtToEquity: 20, label: "소프트웨어" };
    const at100 = { ...base, balance: { debtToEquity: 100 } };
    expect(debtGroup({ ...at100, sector: heavy }).score).toBe(5);
    expect(debtGroup({ ...at100, sector: light }).score).toBe(1);
  });
});

describe("쓰지 않는 말 — WO 하지 말 것", () => {
  it("어떤 문장도 `저평가`·`유망`·`좋은` 을 쓰지 않는다", () => {
    const banned = /저평가|유망|좋은\s*종목|추천|매력적|사야/;
    const cases = [base, { ...base, sector: null }, { ...base, balance: { debtToEquity: 300 } }];
    for (const input of cases) for (const g of companyRead(input)) {
      expect(g.scoreText ?? "").not.toMatch(banned);
      for (const r of g.rows) expect(r.comparison).not.toMatch(banned);
    }
  });

  /**
   * FIX-01 E-2 — **이 규약을 뒤집는다.** 종전에는 `업종 중간값 18.00배` 라고 썼다.
   * 계산은 여전히 중앙값이지만(`sector-stats.ts`: PER 은 적자 직전 종목에서 수백 배로
   * 튀어 평균을 망가뜨린다) **`중간값` 은 통계 용어**이고, 이 화면을 보는 사람에게
   * 그 구분은 정보가 아니라 장벽이다. 표시는 `평균`, 계산 방법은 `method` 가 밝힌다.
   */
  it("[FIX-01 E-2] 표시는 `평균`, 계산 방법에는 `가운데 값` 이라고 밝힌다", () => {
    const groups = companyRead(base);
    const compared = groups.flatMap((g) => g.rows.map((r) => r.comparison)).filter((c) => c.includes("업종"));
    expect(compared.length).toBeGreaterThan(0);
    for (const c of compared) {
      expect(c).toContain("평균");
      expect(c, "통계 용어를 화면에 남기지 않는다").not.toContain("중간값");
    }
    // 중앙값이라는 사실은 숨기지 않는다 — 계산 방법 줄이 말한다.
    const methods = groups.map((g) => g.method).join(" ");
    expect(methods).toContain("가운데 값");
  });

  it("[FIX-01 E-1] 영문 업종명이 화면 문장에 그대로 나가지 않는다", () => {
    const us = companyRead({
      ...base,
      sector: { per: 11, pbr: 1.02, debtToEquity: 7.7, dividendYield: 2, members: 31, level: "industry", label: "Major Banks" },
      balance: { debtToEquity: 7.7 },
    });
    const lines = us.flatMap((g) => [
      ...g.rows.map((r) => r.comparison),
      g.scoreText ?? "",
      g.summaryText ?? "",
      g.method,
    ]);
    /**
     * 지표 약어(`PER`·`PBR`)는 남는다 — 그건 업종명이 아니라 **국내에서도 그렇게 부르는
     * 지표 이름**이다. 걸러야 하는 것은 `Major Banks` 처럼 분류 이름이 영어로 나가는 것이다.
     */
    const METRIC_ABBREVIATIONS = /\b(PER|PBR|PSR|EPS|ROE|ROA|TTM)\b/g;
    for (const line of lines) {
      expect(line.replace(METRIC_ABBREVIATIONS, ""), line).not.toMatch(/[A-Za-z]/);
    }
    // 표에 있는 이름은 한글로 나온다.
    expect(lines.join(" ")).toContain("은행 업종");
  });

  it("[FIX-01 E-1] 표에 없는 영문 업종은 이름 없이 `같은 업종` 으로 — 지어내지 않는다", () => {
    const unknown = companyRead({
      ...base,
      sector: { per: 18, pbr: 1.4, debtToEquity: 80, dividendYield: 1, members: 7, level: "industry", label: "Widget Polishing" },
    });
    const lines = unknown.flatMap((g) => [...g.rows.map((r) => r.comparison), g.method]);
    for (const line of lines) expect(line, line).not.toContain("Widget");
    expect(lines.join(" ")).toContain("같은 업종");
  });

  it("값이 비슷하면 억지로 높다/낮다를 만들지 않는다", () => {
    const same = { ...base, valuation: { per: 18.2, pbr: 1.4, perBand: null, pbrBand: null } };
    expect(valueGroup(same).rows[0]!.comparison).toContain("비슷해요");
  });
});

describe("부채비율 단위 — 배수를 퍼센트로 옮긴다", () => {
  it("팩트시트의 배수(1.0)를 100%로 쓴다 — 1% 가 아니다", () => {
    const g = debtGroup({ ...base, balance: { debtToEquity: 1.0 }, sector: { ...sector, debtToEquity: 1.71 } });
    expect(g.rows[0]!.value).toBe("100.0%");
    expect(g.rows[0]!.comparison).toContain("171.0%");
  });

  it("소수 한 자리를 남긴다 — 반올림하면 서로 다른 값이 같은 글자가 된다", () => {
    const a = debtGroup({ ...base, balance: { debtToEquity: 0.004 }, sector: { ...sector, debtToEquity: 0.012 } });
    expect(a.rows[0]!.value).toBe("0.4%");
    expect(a.rows[0]!.comparison).toContain("1.2%");
    // 종전에는 둘 다 `0%` · `1%` 로 찍혀 "1%보다 낮아요" 옆에 "1%" 가 서 있었다.
    expect(a.rows[0]!.value).not.toBe(a.rows[0]!.comparison.match(/[\d.]+%/)?.[0]);
  });

  it("점수는 그대로 비율로 낸다 — 단위 표기와 판정은 다른 층이다", () => {
    expect(debtGroup({ ...base, balance: { debtToEquity: 0.3 }, sector: { ...sector, debtToEquity: 0.8 } }).score).toBe(5);
  });
});

/**
 * FIX-01 PART A — **한 줄 안에 정반대 말이 같이 나오면 실패.**
 *
 * 실측 화면에 이런 줄이 있었다:
 *
 * ```
 * 매출  -1.0%
 * 작년보다 줄었어요 · 3년째 늘고 있어요
 * ```
 *
 * 줄었다는 건가 늘었다는 건가. 두 사실을 따로 만들어 `·` 로 붙인 결과다. 기간이 다른
 * 둘째 사실은 `trend` 로 **줄을 나눈다**(화면도 다른 `<p>` 로 그린다).
 *
 * ## 요약(`summaryText`)에는 다른 자를 댄다
 *
 * `매출은 늘었는데 영업이익은 줄었어요` 는 **모순이 아니다** — 서로 다른 지표를 말하고,
 * 각 방향에 주어가 붙어 있다. 그래서 요약에는 「반대 말이 같이 못 온다」가 아니라
 * 「반대 말이 오면 주어가 둘이어야 한다」를 건다. 뭉갠 말(`섞여 있어요`)은 금지다 —
 * 무엇이 늘고 무엇이 줄었는지가 정보다.
 */
describe("[FIX-01 A] 한 줄에 정반대 말이 같이 나오지 않는다", () => {
  /**
   * **어간까지 본다.** `/늘/` 만 쓰면 `오늘` 이 걸리고, 그러면 검사가 엉뚱한 곳에서 울린다
   * (실제로 `오늘 한 줄 정리` 가 「늘↔줄」로 잡혔다).
   */
  const OPPOSITES: ReadonlyArray<readonly [RegExp, RegExp, string]> = [
    [/늘(어|었|고|린)|증가/, /줄(어|었|고|인)|감소/, "늘 ↔ 줄"],
    [/높(아|은|다|였)/, /낮(아|은|다|았)/, "높 ↔ 낮"],
    [/좋(아|은|다)/, /나쁘|나쁜/, "좋 ↔ 나쁘"],
    [/오르|올랐/, /내리|내렸/, "오르 ↔ 내리"],
  ];

  /** 방향이 어긋나는 조합을 일부러 만든다 — 모순은 여기서만 생긴다. */
  const inputs: CompanyReadInput[] = [];
  for (const revenueYoy of [12, -1, 0, null]) {
    for (const revenueCagr3y of [6, -6, null]) {
      for (const operatingIncomeYoy of [22, -97.1, null]) {
        for (const operatingTtm of [9, -8, null]) {
          for (const sec of [sector, null]) {
            inputs.push({
              ...base,
              growth: { revenueYoy, revenueCagr3y, operatingIncomeYoy },
              margin: { operatingTtm },
              sector: sec,
              valuation: { per: 12.25, pbr: 0.88, perBand: { percentile: 82, sufficient: true }, pbrBand: { percentile: 12, sufficient: true } },
            });
          }
        }
      }
    }
  }

  it(`한 지표의 한 줄에는 한 방향만 (${inputs.length}가지 조합)`, () => {
    for (const input of inputs) {
      for (const g of companyRead(input)) {
        // 줄 설명 · 둘째 줄 · 점 옆 문장은 각각 한 줄로 그려진다 → 각각 한 방향만.
        const lines = [...g.rows.flatMap((r) => [r.comparison, r.trend ?? ""]), g.scoreText ?? ""];
        for (const line of lines) {
          for (const [up, down, pair] of OPPOSITES) {
            const both = up.test(line) && down.test(line);
            expect(both, `모순 (${pair}): "${line}"`).toBe(false);
          }
        }
      }
    }
  });

  it("기간이 다른 둘째 사실은 `trend` 로 갈라져 나온다 — 같은 줄에 붙지 않는다", () => {
    const g = earningsGroup({
      ...base,
      growth: { revenueYoy: -1, revenueCagr3y: 6, operatingIncomeYoy: -97.1 },
    });
    const revenue = g.rows.find((r) => r.label === "매출")!;
    expect(revenue.comparison).toBe("작년 같은 기간보다 조금 줄었어요");
    expect(revenue.trend).toBe("다만 3년으로 보면 늘어왔어요");
    // 종전 모양(한 줄에 ` · ` 로 이어 붙임)이 되살아나지 않는다.
    expect(revenue.comparison).not.toContain("·");
  });

  it("3년 방향이 같으면 둘째 줄이 없다 — 같은 말을 두 번 하지 않는다", () => {
    const g = earningsGroup({ ...base, growth: { revenueYoy: 8, revenueCagr3y: 6, operatingIncomeYoy: 22 } });
    expect(g.rows.find((r) => r.label === "매출")!.trend).toBeUndefined();
  });

  it("요약에 반대 방향이 오면 **주어가 둘**이다 — 뭉개지 않는다", () => {
    const mixed = earningsGroup({ ...base, growth: { revenueYoy: 8, revenueCagr3y: null, operatingIncomeYoy: -40 } });
    expect(mixed.summaryText).toBe("매출은 늘었는데 영업이익은 줄었어요");
    for (const input of inputs) {
      const text = earningsGroup(input).summaryText ?? "";
      expect(text, "무엇이 늘고 줄었는지 뭉갠 말").not.toContain("섞여 있어요");
      const hasBoth = /늘(어|었|고)/.test(text) && /줄(어|었|고)/.test(text);
      if (hasBoth) {
        expect(text, `주어가 둘이 아니다: "${text}"`).toMatch(/매출.*영업이익|영업이익.*매출/);
      }
    }
  });

  it("숫자 크기를 말로도 구분한다 — `-1.0%` 와 `-97.1%` 가 같은 문장이 아니다", () => {
    const small = earningsGroup({ ...base, growth: { revenueYoy: -1, revenueCagr3y: null, operatingIncomeYoy: -97.1 } });
    const rows = small.rows;
    expect(rows.find((r) => r.label === "매출")!.comparison).toContain("조금");
    expect(rows.find((r) => r.label === "영업이익")!.comparison).toContain("크게");
  });
});
