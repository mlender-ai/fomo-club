import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WO-SUB-06 §6 · 커밋 7 — "이게 틀리는 경우" 섹션.
 *
 * 이 레포의 렌더 검사 관례(`valuationChartRender.test.ts`)를 따라 **소스 스캔**으로 단정한다.
 * DOM 렌더 테스트가 아니라 소스를 보는 이유: 이 섹션의 위험은 시각이 아니라 **문안 누락**이다
 * (고지가 빠지거나, 미확보 블록이 숨겨지거나, 카피가 하드코딩되는 것). 그건 소스에서 보인다.
 */

const SOURCE = readFileSync(new URL("../components/WhereThisIsWrong.tsx", import.meta.url), "utf8");

describe("완료 조건 1 — 유형 리스크는 고지와 함께만 렌더된다", () => {
  it("고지를 필수 prop 으로 받는다 (옵션 아님)", () => {
    expect(SOURCE).toMatch(/disclaimer:\s*string;/);
    expect(SOURCE).not.toMatch(/disclaimer\?:/);
  });

  it("유형 리스크 목록과 고지가 같은 조건 블록에 있다", () => {
    const block = SOURCE.slice(SOURCE.indexOf("archetype.items.length > 0"));
    const listIndex = block.indexOf("archetype.items.map");
    const disclaimerIndex = block.indexOf("archetype.disclaimer");
    expect(listIndex).toBeGreaterThan(-1);
    expect(disclaimerIndex).toBeGreaterThan(listIndex);
  });
});

describe("완료 조건 3 — 종목 고유 리스크 블록을 숨기지 않는다", () => {
  it("항목이 0개면 미확보 문안을 표시한다", () => {
    expect(SOURCE).toMatch(/symbol\.items\.length > 0 \?/);
    expect(SOURCE).toContain("symbol.unavailableText");
  });

  it("'이 회사 고유' 헤딩이 항목 유무와 무관하게 렌더된다", () => {
    const heading = SOURCE.indexOf("이 회사 고유");
    const conditional = SOURCE.indexOf("symbol.items.length > 0 ?");
    // 헤딩이 조건문보다 앞에 있어야 항목 0개일 때도 남는다
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(conditional);
  });
});

describe("§5-3 — 가격·사업 무효 조건 병치", () => {
  it("두 줄을 함께 그린다", () => {
    expect(SOURCE).toContain("invalidation.priceText");
    expect(SOURCE).toContain("invalidation.businessText");
  });

  it("사업 조건이 없으면 사유를 표시한다 — 줄을 지우지 않는다", () => {
    expect(SOURCE).toContain("invalidation.businessAbsentReason");
  });

  it("확인 예정일이 null 이면 상태 문구가 이유를 말한다 (#1040 규약)", () => {
    expect(SOURCE).toContain("CHECK_AT_NOTE");
    expect(SOURCE).toContain("no_source_kr");
  });
});

describe("문안 하드코딩 금지 — 독트린이 정본", () => {
  it("유형 리스크 문안을 컴포넌트에 복붙하지 않는다", () => {
    // 독트린 문안의 특징적 구절이 소스에 있으면 하드코딩된 것이다
    for (const phrase of ["공장이 비슷한 시기", "가진 현금으로 버틸 기간", "이 유형의 종목에 흔히"]) {
      expect(SOURCE, `하드코딩된 문안: ${phrase}`).not.toContain(phrase);
    }
  });

  it("미확보 문안도 데이터로 받는다", () => {
    expect(SOURCE).not.toContain("확보하지 못했어요");
  });
});
