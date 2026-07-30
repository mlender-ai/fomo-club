import { describe, expect, it } from "vitest";
import type { QuarterRecord } from "@fomo/core";
import { composeQ4, parseDartPeriodEnd, quarterEnd, rceptDate } from "../../lib/fundamentals/dart-fundamentals";

/**
 * DART 어댑터 — **실측으로 확정한 전제를 잠근다.**
 *
 * 여기서 잠그는 것은 계산 로직이 아니라 소스의 의미다. 아래 세 가지는 응답만 보고는 틀리게
 * 읽기 쉬운 것들이고, 틀리면 조용히 가짜 숫자가 된다.
 *  1. 분기 손익의 `thstrm_dt` 는 누적 기간으로 표기되지만 금액은 3개월치다
 *  2. Q4 는 연간 − 1~3분기이고, 세 분기 중 하나라도 없으면 구성하지 않는다
 *  3. `filed_at` 은 접수번호 앞 8자리(실측 공시일)다
 */

const REAL = {
  // 종근당(185750) 2025년 실측. 이 숫자가 "반기 = Q2 3개월치" 의 근거다.
  q1Revenue: 400_955_846_488,
  q2Revenue: 434_849_104_888,
  q3Revenue: 429_818_748_658,
  fyRevenue: 1_692_403_987_134,
};

function quarter(period: string, revenue: number | null, overrides: Partial<QuarterRecord> = {}): QuarterRecord {
  return {
    period,
    period_end: `${period.slice(0, 4)}-${{ Q1: "03-31", Q2: "06-30", Q3: "09-30", Q4: "12-31" }[period.slice(4)] ?? "12-31"}`,
    filed_at: "2025-05-15",
    filed_at_source: "disclosed",
    revenue,
    operating_income: null,
    net_income: null,
    eps_diluted: null,
    source: "dart:test",
    ...overrides,
  };
}

describe("접수일 (look-ahead 근거)", () => {
  it("접수번호 앞 8자리가 공시일이다 — 추정이 아니다", () => {
    expect(rceptDate("20251114001538")).toBe("2025-11-14");
    expect(rceptDate("20260318001376")).toBe("2026-03-18");
  });

  it("근거가 없으면 만들어내지 않는다", () => {
    expect(rceptDate(null)).toBeNull();
    expect(rceptDate("2025")).toBeNull();
    expect(rceptDate("99999999000000")).toBeNull();
  });
});

describe("기간말 파싱", () => {
  it("재무상태표 표기 — 그 시점", () => {
    expect(parseDartPeriodEnd("2025.03.31 현재")).toBe("2025-03-31");
  });

  it("손익 표기는 누적 기간이라 **마지막 날짜**를 쓴다 — 시작일을 잡으면 분기가 어긋난다", () => {
    expect(parseDartPeriodEnd("2025.01.01 ~ 2025.09.30")).toBe("2025-09-30");
  });

  it("날짜가 없으면 null", () => {
    expect(parseDartPeriodEnd("제 13 기")).toBeNull();
    expect(parseDartPeriodEnd(undefined)).toBeNull();
  });

  it("분기 번호 → 기간말", () => {
    expect([1, 2, 3, 4].map((quarterNumber) => quarterEnd(2025, quarterNumber))).toEqual([
      "2025-03-31",
      "2025-06-30",
      "2025-09-30",
      "2025-12-31",
    ]);
  });
});

describe("Q4 구성 (연간 − 1~3분기)", () => {
  const annual = quarter("2025", REAL.fyRevenue, { period: "2025", period_end: "2025-12-31", filed_at: "2026-03-18" });

  it("실측 숫자로 Q4 가 정합한다 — 반기를 누적으로 읽었으면 음수가 나온다", () => {
    const q4 = composeQ4(annual, [
      quarter("2025Q1", REAL.q1Revenue),
      quarter("2025Q2", REAL.q2Revenue),
      quarter("2025Q3", REAL.q3Revenue),
    ]);
    expect(q4).not.toBeNull();
    expect(q4!.revenue).toBe(REAL.fyRevenue - REAL.q1Revenue - REAL.q2Revenue - REAL.q3Revenue);
    // 양수여야 한다. 누적으로 오해하면(반기를 6개월로 보면) 여기서 음수가 된다.
    expect(q4!.revenue).toBeGreaterThan(0);
    expect(q4!.period).toBe("2025Q4");
    expect(q4!.period_end).toBe("2025-12-31");
    // 공시일은 사업보고서 접수일이다.
    expect(q4!.filed_at).toBe("2026-03-18");
  });

  it("세 분기 중 하나가 없으면 구성하지 않는다 — 부분 합으로 빼면 Q4 가 과대계상된다", () => {
    expect(composeQ4(annual, [quarter("2025Q1", REAL.q1Revenue), quarter("2025Q3", REAL.q3Revenue)])).toBeNull();
    expect(composeQ4(annual, [])).toBeNull();
  });

  it("한 분기의 값이 null 이면 그 항목만 null — 0 으로 대체하지 않는다", () => {
    const q4 = composeQ4(annual, [
      quarter("2025Q1", REAL.q1Revenue),
      quarter("2025Q2", null),
      quarter("2025Q3", REAL.q3Revenue),
    ]);
    // 매출은 차감 불가라 null. 다른 항목이 전부 null 이면 레코드 자체를 만들지 않는다.
    expect(q4).toBeNull();
  });

  it("EPS 는 차감하지 않는다 — 주식수가 분기마다 달라 성립하지 않는다", () => {
    const q4 = composeQ4(quarter("2025", REAL.fyRevenue, { eps_diluted: 5000 }), [
      quarter("2025Q1", REAL.q1Revenue, { eps_diluted: 1200 }),
      quarter("2025Q2", REAL.q2Revenue, { eps_diluted: 1300 }),
      quarter("2025Q3", REAL.q3Revenue, { eps_diluted: 1100 }),
    ]);
    expect(q4!.eps_diluted).toBeNull();
  });

  it("구성 사실을 source 에 남긴다 — 어느 값이 구성물인지 감사에서 구분돼야 한다", () => {
    const q4 = composeQ4(annual, [
      quarter("2025Q1", REAL.q1Revenue),
      quarter("2025Q2", REAL.q2Revenue),
      quarter("2025Q3", REAL.q3Revenue),
    ]);
    expect(q4!.source).toContain("Q4구성(연간−1~3분기)");
  });
});
