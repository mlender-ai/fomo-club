import { describe, expect, it } from "vitest";
import { findDartRow } from "../src/fundamentals/dart-accounts";

describe("전체 재무제표 행에는 fs_div 가 없다 (2026-08-01 실측)", () => {
  /**
   * KR 현금흐름 확보율 0/238(전무 100%)의 근본 원인.
   *
   * 주요계정은 같은 계정을 CFS/OFS 두 줄로 주므로 fs_div 필터가 필수지만,
   * 전체 재무제표는 fs_div 를 **요청 파라미터로만** 받고 행에 담지 않는다.
   * 그 행들을 `row.fs_div === fsDiv` 로 거르면 undefined 라 한 건도 통과하지 못한다.
   */
  const cfRow = {
    sj_div: "CF",
    account_id: "ifrs-full_CashFlowsFromUsedInOperatingActivities",
    account_nm: "영업활동현금흐름",
    thstrm_amount: "1,000",
  };

  it("fs_div 없는 CF 행이 CFS 요청에서도 매칭된다", () => {
    const hit = findDartRow([cfRow], "operating_cash_flow", "CFS");
    expect(hit?.matchedBy).toBe("account_id");
  });

  it("주요계정의 CFS/OFS 이중 행은 여전히 갈라진다 — 이 완화가 그 필터를 무력화하지 않는다", () => {
    const rows = [
      { sj_div: "IS", fs_div: "OFS", account_nm: "매출액", thstrm_amount: "100" },
      { sj_div: "IS", fs_div: "CFS", account_nm: "매출액", thstrm_amount: "200" },
    ];
    expect(findDartRow(rows, "revenue", "CFS")?.row.thstrm_amount).toBe("200");
    expect(findDartRow(rows, "revenue", "OFS")?.row.thstrm_amount).toBe("100");
  });
});
