import { describe, expect, it } from "vitest";
import {
  SYMBOL_RISK_MAX_CHARS,
  SYMBOL_RISK_MAX_ITEMS,
  SYMBOL_RISK_UNAVAILABLE_TEXT,
  buildSymbolRiskBlock,
  type SymbolRiskCandidate,
} from "../src/risk/symbol-risk";

/**
 * WO-SUB-06 §5-2 · 완료 조건 2·3 — 종목 고유 리스크 조립.
 *
 * 핵심은 두 가지다:
 *  · `source_ids` 없는 항목은 **만들어지지 않는다**(가드로 걸러내는 게 아니라 구조로)
 *  · 항목이 0개면 **사유가 반드시 있다** — "없음"과 "확보하지 못함"은 다른 말이다(§11)
 */

const ok = (text: string, over: Partial<SymbolRiskCandidate> = {}): SymbolRiskCandidate => ({
  text,
  source_ids: ["sec:CLBK:000123:risk-factors#4"],
  source_kind: "filing",
  as_of: "2026-03-18",
  ...over,
});

describe("source_ids 강제 (완료 조건 2)", () => {
  it("출처가 없으면 항목이 만들어지지 않는다", () => {
    const block = buildSymbolRiskBlock([ok("상업용 부동산 대출이 총여신의 28%예요", { source_ids: [] })], null);
    expect(block.items).toEqual([]);
    expect(block.rejected[0]!.rejection.reason).toBe("no_source");
  });

  it("출처가 있으면 통과하고 그대로 보존된다", () => {
    const block = buildSymbolRiskBlock([ok("상업용 부동산 대출이 총여신의 28%예요")], null);
    expect(block.items).toHaveLength(1);
    expect(block.items[0]!.source_ids).toEqual(["sec:CLBK:000123:risk-factors#4"]);
    expect(block.unavailable_reason).toBeNull();
  });
});

describe("'없음'과 '확보하지 못함'을 나눈다 (§11 · 완료 조건 3)", () => {
  it("후보가 아예 없으면 소스 미확보 사유가 붙는다", () => {
    const block = buildSymbolRiskBlock([], null);
    expect(block.items).toEqual([]);
    expect(block.unavailable_reason).toBe("위험요소 소스를 확보하지 못함");
  });

  it("호출부가 넘긴 사유(참조 편입 등)를 그대로 쓴다", () => {
    const block = buildSymbolRiskBlock([], "Item 1A 본문이 참조 편입 안내문");
    expect(block.unavailable_reason).toBe("Item 1A 본문이 참조 편입 안내문");
  });

  it("후보가 있었는데 전부 탈락한 경우는 그 사실을 사유에 남긴다", () => {
    const block = buildSymbolRiskBlock([ok("경쟁이 치열해지고 있어요")], null);
    expect(block.items).toEqual([]);
    expect(block.unavailable_reason).toContain("전부 검증에서 탈락");
    expect(block.unavailable_reason).toContain("boilerplate");
  });

  it("항목이 있으면 사유가 없고, 없으면 사유가 있다 — 둘 다이거나 둘 다 아닌 상태 금지", () => {
    for (const candidates of [[], [ok("매출의 42%가 상위 3개 고객에서 나와요")], [ok("경쟁이 치열해지고 있어요")]]) {
      const block = buildSymbolRiskBlock(candidates, null);
      expect((block.items.length > 0) !== (block.unavailable_reason !== null)).toBe(true);
    }
  });

  it("미확보 문구가 '없음'이라고 쓰지 않는다", () => {
    expect(SYMBOL_RISK_UNAVAILABLE_TEXT).toContain("확보하지 못했");
    expect(SYMBOL_RISK_UNAVAILABLE_TEXT).not.toMatch(/리스크가?\s*없/);
  });
});

describe("문안 규칙", () => {
  it(`${SYMBOL_RISK_MAX_CHARS}자를 넘으면 탈락한다`, () => {
    const long = "가".repeat(SYMBOL_RISK_MAX_CHARS + 1);
    const block = buildSymbolRiskBlock([ok(long)], null);
    expect(block.rejected[0]!.rejection.reason).toBe("too_long");
  });

  it("두 문장이면 탈락한다", () => {
    const block = buildSymbolRiskBlock([ok("매출의 42%가 상위 3개 고객이에요. 계약 만료가 다가와요.")], null);
    expect(block.rejected[0]!.rejection.reason).toBe("multi_sentence");
  });

  it("금지어(투자자문·평가·예측)는 탈락한다", () => {
    const block = buildSymbolRiskBlock([ok("지금 매수 타이밍이 아닐 수 있어요")], null);
    expect(block.rejected[0]!.rejection.reason).toBe("banned_words");
  });

  /**
   * 검증 패스는 인과 단정을 **구조적으로 통과시킨다** — 두 사실이 각각 청크에 있으면 지지된다고
   * 판정한다(WO-SUB-03 실측). 그래서 정규식 가드가 따로 막는다.
   */
  it("'A 상승으로 B 하락' 복합 구문은 INV-09 사전이 먼저 잡는다", () => {
    const block = buildSymbolRiskBlock([ok("조달비용 상승으로 순이자마진이 하락했어요")], null);
    expect(block.rejected[0]!.rejection.reason).toBe("banned_words");
  });

  /**
   * `CAUSAL_PATTERNS`(business-context)에는 INV-09 사전에 없는 패턴이 둘 있다 —
   * `~에 따라 늘/줄/증가/감소` 와 `~로 …이 상승했다` 형태. 두 사전이 겹치기만 하면 하나는
   * 죽은 코드지만, 이 케이스가 통과하는 것으로 추가 가드가 제 역할을 한다는 것을 고정한다.
   */
  it("INV-09 가 놓치는 인과 구문은 CAUSAL_PATTERNS 가 잡는다", () => {
    const block = buildSymbolRiskBlock([ok("금리 인하에 따라 증가한 대출이 많아요")], null);
    expect(block.rejected[0]!.rejection.reason).toBe("causal_assertion");
  });

  it("보일러플레이트는 탈락한다", () => {
    const block = buildSymbolRiskBlock([ok("경기 변동에 따라 실적이 달라질 수 있어요")], null);
    expect(block.rejected[0]!.rejection.reason).toBe("boilerplate");
  });

  it("같은 문안은 한 번만 남는다", () => {
    const text = "매출의 42%가 상위 3개 고객에서 나와요";
    const block = buildSymbolRiskBlock([ok(text), ok(text)], null);
    expect(block.items).toHaveLength(1);
    expect(block.rejected[0]!.rejection.reason).toBe("duplicate");
  });
});

describe("상한과 절단 기록", () => {
  it(`${SYMBOL_RISK_MAX_ITEMS}개를 넘는 후보는 사유와 함께 남는다 — 조용한 절단 금지`, () => {
    const candidates = [1, 2, 3, 4, 5].map((n) => ok(`상위 ${n}개 고객 비중이 ${n * 7}%예요`));
    const block = buildSymbolRiskBlock(candidates, null);
    expect(block.items).toHaveLength(SYMBOL_RISK_MAX_ITEMS);
    expect(block.rejected.filter((entry) => entry.rejection.reason === "over_cap")).toHaveLength(2);
  });

  it("id 가 문안에서 결정론적으로 나온다 (재합성 시 추적 유지)", () => {
    const candidates = [ok("매출의 42%가 상위 3개 고객에서 나와요")];
    expect(buildSymbolRiskBlock(candidates, null).items[0]!.id).toBe(buildSymbolRiskBlock(candidates, null).items[0]!.id);
  });
});
