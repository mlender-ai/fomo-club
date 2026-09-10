import { describe, expect, it } from "vitest";
import {
  composeFiscal,
  composeTtm,
  detectFiscalAnomaly,
  dedupeByPeriodEnd,
  quartersAsOf,
  type QuarterRecord,
} from "@fomo/core";

/** WO-SUB-01 §6-1·§6-2 — TTM 구성과 look-ahead 가드. */

function q(period: string, periodEnd: string, filedAt: string, revenue: number | null, net = revenue): QuarterRecord {
  return {
    period,
    period_end: periodEnd,
    filed_at: filedAt,
    revenue,
    operating_income: revenue === null ? null : revenue / 10,
    net_income: net,
    eps_diluted: net === null ? null : net / 100,
    source: "test",
  };
}

const EIGHT: QuarterRecord[] = [
  q("2024Q2", "2024-06-30", "2024-08-09", 100),
  q("2024Q3", "2024-09-30", "2024-11-08", 110),
  q("2024Q4", "2024-12-31", "2025-03-03", 120),
  q("2025Q1", "2025-03-31", "2025-05-09", 130),
  q("2025Q2", "2025-06-30", "2025-08-08", 140),
  q("2025Q3", "2025-09-30", "2025-11-07", 150),
  q("2025Q4", "2025-12-31", "2026-03-06", 160),
  q("2026Q1", "2026-03-31", "2026-05-11", 170),
];

describe("composeTtm", () => {
  it("최근 4분기 합이고 사용 분기를 기록한다", () => {
    const ttm = composeTtm(EIGHT);
    expect(ttm.revenue).toBe(140 + 150 + 160 + 170);
    expect(ttm.composed_of).toEqual(["2025Q2", "2025Q3", "2025Q4", "2026Q1"]);
  });

  it("4분기 미만이면 null — 연환산하지 않는다", () => {
    const ttm = composeTtm(EIGHT.slice(-3));
    expect(ttm.revenue).toBeNull();
    expect(ttm.net_income).toBeNull();
    expect(ttm.eps_diluted).toBeNull();
    // 왜 못 만들었는지 감사할 수 있도록 모인 분기는 남긴다.
    expect(ttm.composed_of).toEqual(["2025Q3", "2025Q4", "2026Q1"]);
  });

  it("한 분기라도 결측이면 그 항목의 합은 null — 3분기로 4분기 합을 흉내 내지 않는다", () => {
    const withGap = [...EIGHT.slice(0, 7), q("2026Q1", "2026-03-31", "2026-05-11", null)];
    const ttm = composeTtm(withGap);
    expect(ttm.revenue).toBeNull();
    expect(ttm.composed_of).toHaveLength(4);
  });
});

describe("look-ahead 가드 (§6-2)", () => {
  it("시점 d 의 TTM 은 filed_at <= d 인 분기만 쓴다", () => {
    // 2025-06-01 시점: 2025Q1(2025-05-09 공시)까지만 보인다.
    const visible = quartersAsOf(EIGHT, "2025-06-01");
    expect(visible.map((x) => x.period)).toEqual(["2024Q2", "2024Q3", "2024Q4", "2025Q1"]);
    const ttm = composeTtm(EIGHT, "2025-06-01");
    expect(ttm.composed_of).toEqual(["2024Q2", "2024Q3", "2024Q4", "2025Q1"]);
    expect(ttm.revenue).toBe(100 + 110 + 120 + 130);
  });

  it("미공시 분기를 절대 포함하지 않는다", () => {
    for (const asOf of ["2024-07-01", "2025-01-01", "2025-09-01", "2026-04-01"]) {
      const ttm = composeTtm(EIGHT, asOf);
      const used = EIGHT.filter((x) => ttm.composed_of.includes(x.period));
      for (const record of used) expect(record.filed_at <= asOf).toBe(true);
    }
  });

  it("가장 이른 공시일 이전 시점에는 TTM 이 없다", () => {
    const ttm = composeTtm(EIGHT, "2024-01-01");
    expect(ttm.revenue).toBeNull();
    expect(ttm.composed_of).toEqual([]);
  });
});

describe("정정공시 중복 제거", () => {
  it("같은 기간말은 가장 늦게 공시된 것만 남는다(이중 계산 방지)", () => {
    const withRestatement = [...EIGHT, q("2026Q1", "2026-03-31", "2026-06-05", 999)];
    const deduped = dedupeByPeriodEnd(withRestatement);
    expect(deduped.filter((x) => x.period_end === "2026-03-31")).toHaveLength(1);
    expect(deduped[deduped.length - 1]!.revenue).toBe(999);
  });
});

describe("결산월 변경 (§6-1)", () => {
  it("분기 간격이 정상 범위를 벗어나면 사유를 남긴다", () => {
    const shifted = [
      q("2025Q2", "2025-06-30", "2025-08-08", 140),
      q("2025Q3", "2025-09-30", "2025-11-07", 150),
      q("2026Q1", "2026-03-31", "2026-05-11", 170), // 6개월 점프
    ];
    expect(detectFiscalAnomaly(shifted)).toMatch(/분기 간격 이상/);
  });

  it("결산 구조가 바뀌면 coverage_flag=partial 이고 TTM 은 null 이다", () => {
    const shifted = [
      q("2024Q4", "2024-12-31", "2025-03-03", 120),
      q("2025Q2", "2025-06-30", "2025-08-08", 140),
      q("2025Q3", "2025-09-30", "2025-11-07", 150),
      q("2025Q4", "2025-12-31", "2026-03-06", 160),
      q("2026Q1", "2026-03-31", "2026-05-11", 170),
    ];
    const fiscal = composeFiscal(shifted, []);
    expect(fiscal.coverage_flag).toBe("partial");
    expect(fiscal.fiscal_anomaly).toBeTruthy();
    expect(fiscal.ttm.revenue).toBeNull();
  });

  it("정상 8분기면 full", () => {
    expect(composeFiscal(EIGHT, []).coverage_flag).toBe("full");
  });

  it("관측이 하나도 없으면 none", () => {
    const fiscal = composeFiscal([], []);
    expect(fiscal.coverage_flag).toBe("none");
    expect(fiscal.ttm.revenue).toBeNull();
  });

  it("8분기 미만이면 partial (KR 네이버 5분기 상한 케이스)", () => {
    expect(composeFiscal(EIGHT.slice(-5), []).coverage_flag).toBe("partial");
  });
});
