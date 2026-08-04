import { describe, expect, it } from "vitest";
import { kindOfCited } from "../../lib/business-context/synthesize";

/**
 * 문장의 소스 종류는 **인용한 청크**에서 나온다 (KR 슬롯1 공시 승격의 선행 조건).
 *
 * 배지가 `충분` 에 도달하려면 슬롯 중 하나가 `vendor_summary` 가 아니어야 한다
 * (`badge.ts` `onlyVendorBacked`). 종류를 번들 첫 청크로 정하면, 공시 청크와 벤더 청크가
 * 섞인 번들에서 **벤더 근거 문장이 `disclosure` 로 표시되어 받을 자격 없는 배지를 받는다.**
 * KR 슬롯1 을 공시로 승격하면 정확히 그 혼합 번들이 생기므로 승격 전에 고정한다.
 *
 * LLM 을 타지 않는 순수 규칙만 본다 — 검증 호출을 목킹해 우회하면 무엇을 확인하는지가 흐려진다.
 */

const chunk = (id: string, kind: "disclosure" | "vendor_summary" | "market_data") => ({
  source_id: id,
  doc_id: "doc",
  chunk_index: 0,
  kind,
  text: `근거 ${id}`,
});

describe("kindOfCited", () => {
  it("공시만 인용하면 disclosure", () => {
    expect(kindOfCited([chunk("a", "disclosure")], "vendor_summary")).toBe("disclosure");
  });

  it("벤더를 하나라도 인용하면 vendor_summary 로 내려 잡는다 — 오분류는 안전한 쪽으로", () => {
    expect(kindOfCited([chunk("a", "disclosure"), chunk("b", "vendor_summary")], "disclosure")).toBe("vendor_summary");
    // 순서가 바뀌어도 같아야 한다. 첫 원소에 의존하면 안 된다.
    expect(kindOfCited([chunk("b", "vendor_summary"), chunk("a", "disclosure")], "disclosure")).toBe("vendor_summary");
  });

  it("벤더만 인용하면 대체값이 disclosure 여도 vendor_summary 다 — 이것이 고치려던 버그다", () => {
    expect(kindOfCited([chunk("b", "vendor_summary")], "disclosure")).toBe("vendor_summary");
  });

  it("인용이 비면 대체값을 쓴다", () => {
    expect(kindOfCited([], "disclosure")).toBe("disclosure");
  });

  it("market_data 는 벤더가 아니므로 내려 잡지 않는다", () => {
    expect(kindOfCited([chunk("a", "market_data")], "vendor_summary")).toBe("market_data");
  });
});
