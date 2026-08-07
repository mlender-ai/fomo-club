import { describe, expect, it } from "vitest";
import { DOCTRINE } from "../src/archetype/classify";
import { ARCHETYPE_RISK_DISCLAIMER } from "../src/archetype/types";
import { composeWhereThisIsWrong, hasWhereThisIsWrongContent } from "../src/risk/where-this-is-wrong";
import type { SymbolRisk } from "../src/risk/symbol-risk";

/**
 * WO-SUB-06.5 배선 — 화면이 받는 블록 모양.
 *
 * §6 의 세 규칙을 조립 단계에서 지킨다. 컴포넌트가 각자 조립하면 호출부마다 다르게 지켜진다.
 */

const STORED: SymbolRisk[] = [
  {
    id: "sym-1-상업용부동산",
    text: "상업용 부동산 대출이 총여신의 28%예요",
    source_ids: ["dart:BNK:2026:risk#1"],
    source_kind: "filing",
    as_of: "2026-03-18",
  },
];

describe("composeWhereThisIsWrong", () => {
  it("저장분이 있으면 그대로 싣고 사유는 비운다", () => {
    const block = composeWhereThisIsWrong({ archetype: "BANK_FINANCIAL", storedSymbolRisks: STORED });
    expect(block.symbol.items).toHaveLength(1);
    expect(block.symbol.unavailable_reason).toBeNull();
  });

  it("저장분이 없으면 사유가 채워진다 — 빈 블록을 만들지 않는다", () => {
    const block = composeWhereThisIsWrong({ archetype: "BANK_FINANCIAL", storedSymbolRisks: null });
    expect(block.symbol.items).toEqual([]);
    expect(block.symbol.unavailable_reason).toBe("위험요소 합성 레코드가 아직 없음");
    expect(block.symbol.unavailable_text).toContain("확보하지 못했");
  });

  it("배치가 남긴 사유를 그대로 쓴다 (참조 편입 등)", () => {
    const block = composeWhereThisIsWrong({
      archetype: "BANK_FINANCIAL",
      storedSymbolRisks: [],
      symbolUnavailableReason: "Item 1A 본문이 참조 편입 안내문",
    });
    expect(block.symbol.unavailable_reason).toBe("Item 1A 본문이 참조 편입 안내문");
  });

  it("고지는 항상 붙는다 (완료 조건 1)", () => {
    for (const frame of DOCTRINE.archetypes) {
      const block = composeWhereThisIsWrong({ archetype: frame.code, storedSymbolRisks: null });
      expect(block.archetype.disclaimer, frame.code).toBe(ARCHETYPE_RISK_DISCLAIMER);
    }
  });

  it("가격 무효선은 넘겨받은 것만 쓴다 — payload 가 두 번 만들지 않는다", () => {
    const withPrice = composeWhereThisIsWrong({
      archetype: "CYCLICAL_COMMODITY",
      storedSymbolRisks: null,
      priceInvalidationText: "52주 저점 63,000원 이탈 시 이 관점은 무효예요.",
    });
    expect(withPrice.invalidation.price_text).toContain("52주 저점");
    expect(composeWhereThisIsWrong({ archetype: "CYCLICAL_COMMODITY", storedSymbolRisks: null }).invalidation.price_text).toBeNull();
  });

  it("사업 조건이 없는 유형은 사유가 채워진다 — 줄을 지우지 않는다", () => {
    const block = composeWhereThisIsWrong({ archetype: "PHARMA_STABLE", storedSymbolRisks: null });
    expect(block.invalidation.business_text).toBeNull();
    expect(block.invalidation.business_absent_reason).toContain("자동 판정 불가");
  });

  it("check_at 이 null 이면 상태가 짝으로 붙는다 (#1040 규약)", () => {
    const block = composeWhereThisIsWrong({
      archetype: "CYCLICAL_COMMODITY",
      storedSymbolRisks: null,
      earnings: { date: null, status: "no_source_kr" },
    });
    expect(block.invalidation.check_at).toBeNull();
    expect(block.invalidation.check_at_status).toBe("no_source_kr");
  });

  it("조건과 사유가 둘 다이거나 둘 다 아닌 상태가 없다", () => {
    for (const frame of DOCTRINE.archetypes) {
      const block = composeWhereThisIsWrong({ archetype: frame.code, storedSymbolRisks: null });
      const hasText = block.invalidation.business_text !== null;
      const hasReason = block.invalidation.business_absent_reason !== null;
      expect(hasText !== hasReason, frame.code).toBe(true);
    }
  });
});

describe("hasWhereThisIsWrongContent", () => {
  it("유형 리스크가 있으면 낼 가치가 있다", () => {
    expect(hasWhereThisIsWrongContent(composeWhereThisIsWrong({ archetype: "BANK_FINANCIAL", storedSymbolRisks: null }))).toBe(true);
  });

  it("UNCLASSIFIED 는 유형 리스크·사업 조건이 모두 없어 섹션을 만들지 않는다", () => {
    const block = composeWhereThisIsWrong({ archetype: "UNCLASSIFIED", storedSymbolRisks: null });
    expect(block.archetype.items).toEqual([]);
    expect(block.invalidation.business_text).toBeNull();
    expect(hasWhereThisIsWrongContent(block)).toBe(false);
  });

  it("UNCLASSIFIED 라도 종목 고유 리스크가 있으면 낸다", () => {
    const block = composeWhereThisIsWrong({ archetype: "UNCLASSIFIED", storedSymbolRisks: STORED });
    expect(hasWhereThisIsWrongContent(block)).toBe(true);
  });
});
