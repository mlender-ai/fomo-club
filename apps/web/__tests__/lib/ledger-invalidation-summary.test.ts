import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WO-SUB-07 §6-5·§8 — 집계 규칙 감시.
 *
 * DB 를 띄우지 않고 **규칙이 코드에 남아 있는지**를 본다. 이 집계의 위험은 계산 오류가 아니라
 * 조용한 제외다 — 판정 불가를 분모에서 빼거나, 폐지 종목을 걸러내면 성적이 좋아지는데
 * 화면에서는 그게 안 보인다.
 */

const SUMMARY = readFileSync(new URL("../../lib/ledger/invalidation-summary.ts", import.meta.url), "utf8");
const JUDGE = readFileSync(new URL("../../lib/ledger/business-invalidation-judge.ts", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("../../../fomo-web/app/track-record/page.tsx", import.meta.url), "utf8");

describe("판정 불가를 분모에서 빼지 않는다 (§6-4)", () => {
  it("분모 n 이 도달 + 미도달 + 판정 불가 셋의 합이다", () => {
    expect(SUMMARY).toMatch(/const n = reached \+ notReached \+ undetermined/);
  });

  it("판정 불가를 미도달로 합치지 않는다", () => {
    // `insufficient_data` 를 `holding` 으로 매핑하는 코드가 있으면 성적이 조용히 좋아진다.
    expect(SUMMARY).not.toMatch(/insufficient_data.*=>.*holding/);
    expect(SUMMARY).toContain("businessUndetermined += 1");
  });

  it("화면이 셋을 모두 표시한다", () => {
    expect(PAGE).toContain("판정 불가");
    expect(PAGE).toContain("미도달");
  });
});

/**
 * 완료 조건 5 — 상장폐지·거래정지 종목이 집계에서 **자동 제외되지 않는다.**
 *
 * 이 집계의 분모는 원장의 발행 레코드다. 종목 상태로 거르는 코드가 들어오면 분모가 줄고
 * 성적표가 조용히 좋아진다. 그런 필터가 없다는 것을 단정한다.
 */
describe("생존 편향 방지 (§6-5)", () => {
  it("종목 상태(폐지·정지)로 발행분을 거르지 않는다", () => {
    for (const forbidden of ["delisted", "상장폐지", "거래정지", "suspended", "halted"]) {
      // 주석에서 언급하는 것은 허용하되, 필터 조건으로 쓰이면 안 된다.
      const asFilter = new RegExp(`filter\\([^)]*${forbidden}`, "i");
      expect(SUMMARY, forbidden).not.toMatch(asFilter);
    }
  });

  it("가격 관측이 없으면 판정 불가로 남기고 분모에 둔다 — 빼지 않는다", () => {
    expect(SUMMARY).toMatch(/observed\.length === 0\) priceUndetermined \+= 1/);
  });
});

describe("발행 시점 조건으로 판정한다 (§4 규칙 1·5)", () => {
  it("판정기가 스탬프의 조건을 읽는다 — 지금 카탈로그를 다시 읽지 않는다", () => {
    expect(JUDGE).toContain("stamp.invalidation_business_rule");
    // `businessInvalidationFor` 를 판정 시점에 부르면 사후 기준으로 채점하는 것이다.
    expect(JUDGE).not.toContain("businessInvalidationFor");
  });

  it("발행 1건당 1회만 판정한다 — 재실행해도 같은 결과(완료 조건 4)", () => {
    expect(JUDGE).toMatch(/idempotencyKey: `business-invalidation:\$\{selection\.id\}`/);
    expect(JUDGE).toContain("judgedIds.has");
  });

  it("판정 시점 팩트시트 해시를 남긴다 — 어느 데이터로 판정했는지 복원 가능", () => {
    expect(JUDGE).toContain("factsheet_hash");
  });
});

describe("표본 수 병기 (§8 · 완료 조건 6)", () => {
  it("화면이 판단 건수를 함께 낸다", () => {
    // 변수명이 아니라 **사실**을 본다 — 판단 건수를 화면이 함께 낸다(DS-04 재작성 후 `Row sample`).
    expect(PAGE).toMatch(/판단 \$\{[a-zA-Z.]*n\.toLocaleString/);
  });

  it("n 이 0 이면 비율을 0% 로 쓰지 않는다", () => {
    expect(SUMMARY).toMatch(/n > 0 \? \(reached \/ n\) \* 100 : null/);
  });
});

describe("버전 분포 표시 (§7)", () => {
  it("룰셋 버전 분포를 집계에 담고 화면에 낸다", () => {
    expect(SUMMARY).toContain("rulesetVersions");
    expect(PAGE).toContain("규칙 버전 분포");
  });
});
