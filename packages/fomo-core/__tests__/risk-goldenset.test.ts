import { describe, expect, it } from "vitest";
import { DOCTRINE } from "../src/archetype/classify";
import { ARCHETYPE_RISK_DISCLAIMER } from "../src/archetype/types";
import {
  archetypeRiskBlock,
  buildSymbolRiskBlock,
  businessInvalidationFor,
  filterBoilerplate,
  judgeBusinessInvalidation,
  type SymbolRiskCandidate,
} from "../src/risk";

/**
 * WO-SUB-06 §7 커밋 8 — 소스 오염 테스트 + 골든셋 스냅샷.
 *
 * 앞선 커밋들은 각 조각을 따로 검사한다. 여기서는 **한 종목의 블록 전체**를 조립해 스냅샷으로
 * 고정한다 — 조각이 다 통과하는데 합친 결과가 틀리는 경우를 잡는 것이 목적이다.
 * 예: 유형 리스크가 종목 고유 블록에 섞여 들어가거나, 미확보 사유가 사라지거나,
 * 무효 조건이 판정 불가 형태로 조립되는 것.
 */

const CANDIDATES: SymbolRiskCandidate[] = [
  { text: "상업용 부동산 대출이 총여신의 28%예요", source_ids: ["dart:BNK:2026:risk#1"], source_kind: "filing", as_of: "2026-03-18" },
  { text: "경쟁이 치열해지고 있어요", source_ids: ["dart:BNK:2026:risk#2"], source_kind: "filing", as_of: "2026-03-18" },
  { text: "빌려준 돈을 못 받을 가능성이 늘고 있어요", source_ids: [], source_kind: "filing", as_of: "2026-03-18" },
];

/** 한 종목의 "이게 틀리는 경우" 블록 전체를 조립한다(화면이 받는 모양). */
function assembleBlock(code: Parameters<typeof archetypeRiskBlock>[0], candidates: SymbolRiskCandidate[]) {
  const symbol = buildSymbolRiskBlock(candidates, null);
  const archetype = archetypeRiskBlock(code);
  const invalidation = businessInvalidationFor(code, { date: null, status: "no_source_kr" });
  return {
    symbolTexts: symbol.items.map((item) => item.text),
    symbolUnavailable: symbol.unavailable_reason,
    symbolRejected: symbol.rejected.map((entry) => entry.rejection.reason).sort(),
    archetypeTexts: archetype.items.map((item) => item.text),
    disclaimer: archetype.disclaimer,
    businessCondition: invalidation?.condition_text ?? null,
    checkAtStatus: invalidation?.check_at_status ?? null,
  };
}

describe("골든셋 스냅샷 — BANK_FINANCIAL 한 종목 블록", () => {
  it("조립 결과가 고정된다", () => {
    expect(assembleBlock("BANK_FINANCIAL", CANDIDATES)).toMatchInlineSnapshot(`
      {
        "archetypeTexts": [
          "빌려준 돈을 못 받을 가능성이 늘면 그만큼을 이익에서 먼저 떼어 둬요",
          "예금이 빠져나가면 이자를 더 주고 돈을 구해야 할 수 있어요",
          "예금 이자와 대출 이자가 오르내리는 속도가 다르면 은행이 남기는 이자 차익이 흔들릴 수 있어요",
          "상가나 사무실 건물에 빌려준 돈이 많으면 그 시장이 나빠질 때 함께 영향을 받아요",
        ],
        "businessCondition": "이익에서 미리 떼어 두는 대손 금액이 2분기 연속 늘면 이 관점은 다시 봐야 해요",
        "checkAtStatus": "no_source_kr",
        "disclaimer": "이 유형의 종목에 흔히 해당하는 항목이에요. 이 회사만의 상황은 아니에요.",
        "symbolRejected": [
          "boilerplate",
          "no_source",
        ],
        "symbolTexts": [
          "상업용 부동산 대출이 총여신의 28%예요",
        ],
        "symbolUnavailable": null,
      }
    `);
  });

  it("종목 고유 블록에 유형 리스크 문안이 섞이지 않는다", () => {
    const block = assembleBlock("BANK_FINANCIAL", CANDIDATES);
    for (const text of block.archetypeTexts) expect(block.symbolTexts).not.toContain(text);
  });

  it("종목 후보가 전부 탈락하면 미확보 사유가 채워진다", () => {
    const block = assembleBlock("BANK_FINANCIAL", [CANDIDATES[1]!, CANDIDATES[2]!]);
    expect(block.symbolTexts).toEqual([]);
    expect(block.symbolUnavailable).toContain("전부 검증에서 탈락");
  });
});

/**
 * 소스 오염 — 커뮤니티·사용자 취향 텍스트가 리스크로 들어오는 경로를 막는다.
 *
 * `SymbolRisk.source_kind` 는 `filing | market_data` 뿐이라 타입 수준에서 community 가 없다.
 * 그런데 문자열로 우회하면 통과할 수 있으므로 실제로 시도해 본다.
 */
describe("소스 오염 방지", () => {
  it("커뮤니티 문구는 보일러플레이트·금지어 어느 쪽에든 걸린다", () => {
    const community = [
      "여기서 더 빠지면 손절이다",
      "무조건 반등이니 지금 매수 타이밍이에요",
      "종토방에서 다들 물타기 하고 있어요",
    ];
    const block = buildSymbolRiskBlock(
      community.map((text) => ({ text, source_ids: ["c1"], source_kind: "filing" as const, as_of: "2026-08-07" })),
      null
    );
    expect(block.items).toEqual([]);
  });

  it("보일러플레이트 필터가 지운 것은 사유와 함께 남는다", () => {
    const result = filterBoilerplate(["경쟁이 치열합니다", "매출의 42%가 상위 3개 고객이에요"], (text) => text);
    expect(result.kept).toEqual(["매출의 42%가 상위 3개 고객이에요"]);
    expect(result.dropped).toHaveLength(1);
  });
});

describe("전 유형 조립 — 누락·형태 붕괴 없음", () => {
  it("모든 아키타입이 고지와 함께 블록을 만들고, 무효 조건은 판정 가능하거나 사유가 있다", () => {
    for (const frame of DOCTRINE.archetypes) {
      const archetype = archetypeRiskBlock(frame.code);
      expect(archetype.disclaimer, frame.code).toBe(ARCHETYPE_RISK_DISCLAIMER);
      const invalidation = businessInvalidationFor(frame.code, { date: null, status: "unknown" });
      if (!invalidation) continue;
      // 조립된 조건이 실제로 판정까지 가는지 — 형태만 맞고 판정이 안 되는 상태를 잡는다.
      const verdict = judgeBusinessInvalidation(invalidation, { series: [] });
      expect(verdict, frame.code).toBe("insufficient_data");
    }
  });
});
