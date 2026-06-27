import { describe, expect, it } from "vitest";

import { cleanMaterialTitle } from "../../lib/discovery-supply";

describe("discovery material news filter", () => {
  it("keeps concrete catalyst headlines for card hooks", () => {
    expect(cleanMaterialTitle("아이씨티케이, 120억원 규모 공급계약 공시")).toBe("아이씨티케이, 120억원 규모 공급계약 공시");
    expect(cleanMaterialTitle("코아스템켐온, 신약 임상 2상 승인")).toBe("코아스템켐온, 신약 임상 2상 승인");
    expect(cleanMaterialTitle("삼현, 방산 부품 수주잔고 확대")).toBe("삼현, 방산 부품 수주잔고 확대");
  });

  it("rejects non-material human-interest and market-wrap headlines", () => {
    expect(cleanMaterialTitle("현대차 회장, 어려울 때마다 이순신 장군 찾았다")).toBeUndefined();
    expect(cleanMaterialTitle("로켓헬스케어 CEO 인터뷰, 창업 철학 공개")).toBeUndefined();
    expect(cleanMaterialTitle("오늘의 증시, 코스피 장중 약세")).toBeUndefined();
    expect(cleanMaterialTitle("ESG 캠페인으로 지역사회 봉사 확대")).toBeUndefined();
  });

  it("does not treat generic stock movement as material news", () => {
    expect(cleanMaterialTitle("특징주 모음, 2차전지주 동반 상승")).toBeUndefined();
    expect(cleanMaterialTitle("장중 시황, 반도체주 차익 실현")).toBeUndefined();
  });
});
