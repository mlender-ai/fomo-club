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

  it("점이 있으면 문장이 반드시 함께 있다 — 점만 두지 않는다 (완료 확인 9)", () => {
    for (const g of companyRead(base)) if (g.score !== null) expect(g.scoreText).toBeTruthy();
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

  it("적자라고 말하고, 자산 기준으로는 어떤지 함께 쓴다", () => {
    expect(valueGroup(loss).scoreText).toContain("적자라서 이익으로는 값을 잴 수 없어요");
    expect(earningsGroup(loss).scoreText).toBe("지금은 영업에서 적자예요");
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

  it("업종 통계를 `평균` 이라고 쓰지 않는다 — 중앙값이다", () => {
    for (const g of companyRead(base)) for (const r of g.rows) expect(r.comparison).not.toContain("평균");
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
