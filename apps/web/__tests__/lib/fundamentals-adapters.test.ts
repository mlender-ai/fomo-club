import { describe, expect, it } from "vitest";
import { isConsensusColumn, parseFinanceTable, parseNaverNumber, periodKeyToEnd } from "../../lib/fundamentals/naver-fundamentals";
import { parseNasdaqDate, parseNasdaqNumber } from "../../lib/fundamentals/nasdaq-fundamentals";
import { collectCreditLossProvision, composeQ4, periodLabel } from "../../lib/fundamentals/sec-xbrl";
import type { CompanyFacts } from "../../lib/fundamentals/sec-xbrl";

/**
 * 어댑터 파싱 골든 픽스처 (WO-SUB-01 §11).
 *
 * 픽스처는 **실제 응답에서 잘라온 것**이다(2026-07-27~28 실측). 추측한 키로 만든 픽스처는
 * 파서를 통과시키지만 프로덕션에서 깨진다 — WO-SUB-00 이 6번 재실측한 원인이 그것이었다.
 */

/** 종근당(185750) `finance/annual` 실측 응답에서 잘라온 것. */
const JONGKUNDANG_ANNUAL = {
  financeInfo: {
    trTitleList: [
      { isConsensus: "N", title: "2023.12.", key: "202312" },
      { isConsensus: "N", title: "2024.12.", key: "202412" },
      { isConsensus: "N", title: "2025.12.", key: "202512" },
      { isConsensus: "Y", title: "2026.12.", key: "202612" },
    ],
    rowList: [
      { title: "매출액", columns: { "202312": { value: "16,694" }, "202412": { value: "15,864" }, "202512": { value: "16,924" }, "202612": { value: "19,000" } } },
      { title: "영업이익", columns: { "202312": { value: "2,466" }, "202412": { value: "995" }, "202512": { value: "806" }, "202612": { value: "810" } } },
      { title: "당기순이익", columns: { "202312": { value: "2,136" }, "202412": { value: "1,114" }, "202512": { value: "778" }, "202612": { value: "630" } } },
      { title: "지배주주순이익", columns: { "202312": { value: "2,125" }, "202412": { value: "1,091" }, "202512": { value: "775" }, "202612": { value: "-" } } },
      { title: "EPS", columns: { "202312": { value: "15,397" }, "202412": { value: "7,902" }, "202512": { value: "5,615" }, "202612": { value: "4,564" } } },
      { title: "BPS", columns: { "202312": { value: "61,085" }, "202412": { value: "67,748" }, "202512": { value: "76,180" }, "202612": { value: "-" } } },
      { title: "부채비율", columns: { "202312": { value: "71.94" }, "202412": { value: "62.74" }, "202512": { value: "78.89" }, "202612": { value: "-" } } },
    ],
  },
  corporationSummary: { comment1: "동사는 …", comment2: "전문의약품 …", comment3: "R&D …" },
};

describe("네이버 숫자 파싱", () => {
  it("한국식 단위를 원 단위로 바꾼다", () => {
    expect(parseNaverNumber("9,469억")).toBe(946_900_000_000);
    expect(parseNaverNumber("1.2조")).toBe(1_200_000_000_000);
    expect(parseNaverNumber("68,600")).toBe(68_600);
    expect(parseNaverNumber("12.05배")).toBe(12.05);
    expect(parseNaverNumber("0.73%")).toBe(0.73);
  });

  it("빈 값·대시는 null", () => {
    for (const raw of [undefined, "", "-", "N/A"]) expect(parseNaverNumber(raw)).toBeNull();
  });
});

describe("기간 키 → 기간말", () => {
  it("분기 말일을 정확히 계산한다", () => {
    expect(periodKeyToEnd("202603")).toBe("2026-03-31");
    expect(periodKeyToEnd("202606")).toBe("2026-06-30");
    expect(periodKeyToEnd("202512")).toBe("2025-12-31");
    expect(periodKeyToEnd("2026.03.")).toBe("2026-03-31");
  });

  it("형식이 아니면 null", () => {
    expect(periodKeyToEnd("2026")).toBeNull();
    expect(periodKeyToEnd("202613")).toBeNull();
  });
});

describe("isConsensus 는 문자열 Y/N 이다 (WO-SUB-00 실사 정정)", () => {
  it("\"N\" 을 truthy 로 읽지 않는다", () => {
    expect(isConsensusColumn("N")).toBe(false);
    expect(isConsensusColumn("Y")).toBe(true);
    expect(isConsensusColumn(undefined)).toBe(false);
  });

  it("boolean 로 오는 경우도 받는다", () => {
    expect(isConsensusColumn(true)).toBe(true);
    expect(isConsensusColumn(false)).toBe(false);
  });
});

describe("네이버 재무 표 파싱", () => {
  const parsed = parseFinanceTable(JONGKUNDANG_ANNUAL, true, "naver_finance_annual");

  it("예상 컬럼은 실적 레코드에서 제외하고 별도로 표시한다", () => {
    expect(parsed.records.map((r) => r.period)).toEqual(["2023FY", "2024FY", "2025FY"]);
    expect(parsed.consensusKey).toBe("202612");
  });

  it("억원 단위를 원으로 환산한다", () => {
    expect(parsed.records[2]!.revenue).toBe(1_692_400_000_000);
    expect(parsed.records[2]!.operating_income).toBe(80_600_000_000);
  });

  it("순이익은 지배주주순이익을 쓴다(주당지표 기준 일치)", () => {
    expect(parsed.records[2]!.net_income).toBe(77_500_000_000);
    expect(parsed.records[2]!.concepts?.net_income).toBe("지배주주순이익");
  });

  it("EPS 는 원 단위 그대로", () => {
    expect(parsed.records[2]!.eps_diluted).toBe(5_615);
  });

  it("공시일이 없으므로 법정 제출기한을 쓰고 근거를 표기한다", () => {
    const record = parsed.records[2]!;
    expect(record.filed_at_source).toBe("statutory_deadline");
    // 사업보고서 = 사업연도 종료 후 90일.
    expect(record.filed_at).toBe("2026-03-31");
    // 기한은 실제 공시일보다 늦거나 같다 → look-ahead 를 만들지 않는다.
    expect(record.filed_at > record.period_end).toBe(true);
  });

  it("분기 표는 45일 기한을 쓴다", () => {
    const quarterTable = {
      financeInfo: {
        trTitleList: [{ isConsensus: "N", title: "2026.03.", key: "202603" }],
        rowList: [{ title: "매출액", columns: { "202603": { value: "4,478" } } }],
      },
    };
    const result = parseFinanceTable(quarterTable, false, "naver_finance_quarter");
    expect(result.records[0]!.period).toBe("2026Q1");
    expect(result.records[0]!.filed_at).toBe("2026-05-15");
  });

  it("전 항목이 비면 레코드를 만들지 않는다", () => {
    const empty = {
      financeInfo: {
        trTitleList: [{ isConsensus: "N", title: "2026.03.", key: "202603" }],
        rowList: [{ title: "매출액", columns: { "202603": { value: "-" } } }],
      },
    };
    expect(parseFinanceTable(empty, false, "naver_finance_quarter").records).toEqual([]);
  });
});

describe("Nasdaq 파싱", () => {
  it("통화·단위 표기를 숫자로 바꾼다", () => {
    expect(parseNasdaqNumber("$1.2B")).toBe(1_200_000_000);
    expect(parseNasdaqNumber("$416,161,000")).toBe(416_161_000);
    expect(parseNasdaqNumber("2.37%")).toBe(2.37);
    expect(parseNasdaqNumber("11.01")).toBe(11.01);
  });

  it("N/A·빈 값은 null", () => {
    for (const raw of [undefined, "", "N/A", "--"]) expect(parseNasdaqNumber(raw)).toBeNull();
  });

  it("타임스탬프에 ET 가 붙어도 날짜를 뽑는다(실측 형식)", () => {
    expect(parseNasdaqDate("Jul 22, 2026 8:01 AM ET")).toBe("2026-07-22");
    expect(parseNasdaqDate("Jul 27, 2026")).toBe("2026-07-27");
    expect(parseNasdaqDate("알 수 없음")).toBeNull();
  });
});

describe("SEC Q4 구성 (실측: 10-K 는 분기형 사실을 태깅하지 않는다)", () => {
  const quarters = new Map([
    ["2025-03-31", { val: 10, filed: "2025-05-09", restated: false, fy: 2025, fp: "Q1" }],
    ["2025-06-30", { val: 12, filed: "2025-08-08", restated: false, fy: 2025, fp: "Q2" }],
    ["2025-09-30", { val: 14, filed: "2025-11-07", restated: false, fy: 2025, fp: "Q3" }],
  ]);
  const annual = new Map([["2025-12-31", { val: 50, filed: "2026-03-06", restated: false, fy: 2025, fp: "FY" }]]);

  it("Q4 = 연간 − 1~3분기, 공시일은 연간 보고서 공시일", () => {
    const q4 = composeQ4(quarters, annual);
    expect(q4.get("2025-12-31")).toEqual({ val: 14, filed: "2026-03-06", restated: false, fy: 2025, fp: "Q4" });
  });

  it("구성된 Q4 는 회계분기를 Q4 로 못박아 라벨이 충돌하지 않는다", () => {
    // 실측(NUE): 52/53주 회계연도라 분기말이 10-04 → 달력 규칙으로는 Q4, 구성 Q4 는 12-31 → 역시 Q4.
    // fy·fp 를 쓰면 각각 2025Q3 / 2025Q4 로 갈라진다.
    expect(periodLabel("2025-10-04", { fy: 2025, fp: "Q3" })).toBe("2025Q3");
    expect(periodLabel("2025-12-31", composeQ4(quarters, annual).get("2025-12-31"))).toBe("2025Q4");
  });

  it("fy·fp 가 없으면 달력 월로 폴백한다", () => {
    expect(periodLabel("2026-03-31")).toBe("2026Q1");
    expect(periodLabel("2026-06-30", { fy: 2026 })).toBe("2026Q2");
  });

  it("세 분기가 다 모이지 않으면 구성하지 않는다(부분 차감 금지)", () => {
    const partial = new Map([["2025-03-31", { val: 10, filed: "2025-05-09", restated: false }]]);
    expect(composeQ4(partial, annual).size).toBe(0);
  });

  it("연간 값이 없으면 구성하지 않는다", () => {
    expect(composeQ4(quarters, new Map()).size).toBe(0);
  });
});

/**
 * WO-SUB-CLOSE PART A — 대손충당금 전입액 수집.
 *
 * 두 가지가 회귀하면 BANK 무효 조건이 조용히 거짓말을 한다:
 *
 * 1. **합집합이 아니라 최다 관측 하나만 고르면** 2020년 CECL 개명 이전/이후 한쪽 시대가
 *    통째로 사라진다. 06 프로브 v2 가 실제로 이 함정에 빠져 최근 분기만 잡혔다.
 * 2. **전입 후 순이자이익 개념을 잡으면** 전입액이 아닌 값으로 "대손이 늘었다"를 판정한다.
 *    관측 수가 많아서 프로브 v1 이 실제로 이걸 골랐다.
 */
describe("SEC 대손충당금 전입액 (PART A)", () => {
  const entry = (start: string, end: string, val: number, filed: string, form = "10-Q") => ({
    start,
    end,
    val,
    form,
    filed,
  });
  const facts = (concepts: Record<string, ReturnType<typeof entry>[]>): CompanyFacts => ({
    facts: {
      "us-gaap": Object.fromEntries(Object.entries(concepts).map(([name, entries]) => [name, { units: { USD: entries } }])),
    },
  });

  it("CECL 로 개명된 두 개념을 합집합으로 모은다 — 한쪽 시대를 버리지 않는다", () => {
    const result = collectCreditLossProvision(
      facts({
        // 개명 전(관측 1건)과 개명 후(관측 2건). 최다 관측만 고르면 2019년이 사라진다.
        ProvisionForLoanAndLeaseLosses: [entry("2019-01-01", "2019-03-31", 80, "2019-05-01")],
        FinancingReceivableExcludingAccruedInterestCreditLossExpenseReversal: [
          entry("2025-01-01", "2025-03-31", 100, "2025-05-01"),
          entry("2025-04-01", "2025-06-30", 130, "2025-08-01"),
        ],
      })
    );
    expect([...result.keys()].sort()).toEqual(["2019-03-31", "2025-03-31", "2025-06-30"]);
    expect(result.get("2019-03-31")).toEqual({ val: 80, concept: "ProvisionForLoanAndLeaseLosses" });
    expect(result.get("2025-06-30")?.val).toBe(130);
  });

  it("전입 후 순이자이익·약정 개념은 잡지 않는다(일부러 뺀 2종)", () => {
    const result = collectCreditLossProvision(
      facts({
        InterestIncomeExpenseAfterProvisionForLoanLoss: [entry("2025-01-01", "2025-03-31", 900, "2025-05-01")],
        OffBalanceSheetCreditLossLiabilityProvisionExpenseReversal: [entry("2025-01-01", "2025-03-31", 5, "2025-05-01")],
      })
    );
    expect(result.size).toBe(0);
  });

  it("개념이 없는 종목(비은행)은 빈 결과이고 오류가 아니다", () => {
    expect(collectCreditLossProvision(facts({ Revenues: [entry("2025-01-01", "2025-03-31", 1, "2025-05-01")] })).size).toBe(0);
    expect(collectCreditLossProvision({}).size).toBe(0);
  });

  it("Q4 는 연간에서 1~3분기를 빼서 구성한다(은행은 4분기를 10-K 에만 싣는다)", () => {
    const result = collectCreditLossProvision(
      facts({
        ProvisionForLoanAndLeaseLosses: [
          entry("2025-01-01", "2025-03-31", 100, "2025-05-01"),
          entry("2025-04-01", "2025-06-30", 110, "2025-08-01"),
          entry("2025-07-01", "2025-09-30", 120, "2025-11-01"),
          entry("2025-01-01", "2025-12-31", 500, "2026-02-20", "10-K"),
        ],
      })
    );
    expect(result.get("2025-12-31")?.val).toBe(170);
  });

  it("USD 가 아닌 통화는 환산하지 않고 버린다(§4 규칙 3)", () => {
    const result = collectCreditLossProvision({
      facts: {
        "us-gaap": {
          ProvisionForLoanAndLeaseLosses: {
            units: { KRW: [entry("2025-01-01", "2025-03-31", 100_000, "2025-05-01")] },
          },
        },
      },
    });
    expect(result.size).toBe(0);
  });
});
