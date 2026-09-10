import { describe, expect, it } from "vitest";
import { normalizeCompanyName, companyDisplay, BACKTEST_MIN_SAMPLE, SIGNAL_RESUME_MIN_SAMPLE } from "@fomo/core";
import { signalAmount } from "../lib/quiet-pick";

/**
 * WO-P6 라스트마일 봉인.
 * ① 통계 노출 게이트 n≥30 ② 재등장 판정(금액·신규신호) ③ 회사명 정규화(데이터 계층)
 */

describe("① 신호 성적 노출 게이트 — n<30 이면 숫자를 안 띄운다", () => {
  it("백테스트 노출 기준이 원장 배지와 같은 잣대(30)", () => {
    expect(BACKTEST_MIN_SAMPLE).toBe(SIGNAL_RESUME_MIN_SAMPLE);
    expect(BACKTEST_MIN_SAMPLE).toBe(30);
  });
});

describe("② 재등장 판정 — 규모 실수치", () => {
  it("US 매수금액 / KR 순매수량 중 있는 값을 쓴다", () => {
    expect(signalAmount({ valueUsd: 4_800_000 })).toBe(4_800_000);
    expect(signalAmount({ streakSum: 310_000 })).toBe(310_000);
    expect(signalAmount({ insiderValueKrw: 1_200_000_000 })).toBe(1_200_000_000);
  });
  it("값이 없거나 0/비유한이면 undefined(가짜 비교 금지)", () => {
    expect(signalAmount({})).toBeUndefined();
    expect(signalAmount({ valueUsd: 0 })).toBeUndefined();
    expect(signalAmount({ valueUsd: Number.NaN })).toBeUndefined();
  });
});

describe("③ 회사명 정규화 — 데이터 계층에서 한 번만", () => {
  it("법인 접미·주 꼬리를 제거한다", () => {
    expect(normalizeCompanyName("Columbia Financial, Inc./Md/")).toBe("Columbia Financial");
    expect(normalizeCompanyName("Apple Inc.")).toBe("Apple");
    expect(normalizeCompanyName("Berkshire Hathaway Inc")).toBe("Berkshire Hathaway");
  });
  it("한글 사명은 그대로 둔다", () => {
    expect(normalizeCompanyName("삼성전자")).toBe("삼성전자");
    expect(normalizeCompanyName("HD현대중공업")).toBe("HD현대중공업");
  });
  it("과잉 삭제로 이름이 사라지지 않는다", () => {
    expect(normalizeCompanyName("Inc.")).toBe("Inc.");
    expect(normalizeCompanyName("")).toBe("");
  });
  it("displayName + ticker 를 분리해 돌려준다(US=심볼, KR=종목코드)", () => {
    expect(companyDisplay({ canonical: "Columbia Financial, Inc./Md/", symbol: "CLBK", country: "US" }))
      .toEqual({ displayName: "Columbia Financial", ticker: "CLBK" });
    expect(companyDisplay({ canonical: "삼성전자", naverCode: "005930", country: "KR" }))
      .toEqual({ displayName: "삼성전자", ticker: "005930" });
  });
  it("티커가 없으면 ticker 키 자체가 없다(빈 문자열 노출 금지)", () => {
    expect(companyDisplay({ canonical: "Apple Inc.", country: "US" })).toEqual({ displayName: "Apple" });
  });
});
