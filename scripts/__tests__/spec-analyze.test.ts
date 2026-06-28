import { describe, expect, it } from "vitest";
import { analyzeSpecDiff } from "../spec-analyze";

describe("spec analyze", () => {
  it("flags the #696-style deletion of concrete hooks into generic copy", () => {
    const result = analyzeSpecDiff(
      diffFor(
        "apps/web/lib/discovery-supply.ts",
        [
          "-  return `오늘 ${sector} 12개 종목 중 가장 먼저 신호가 잡혔어요.`;",
          "+  return `오늘 ${sector} 흐름에서 먼저 확인된 종목이에요.`;",
        ],
      ),
      { guardDiscoveryRan: true },
    );

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("diff.generic_overwrite");
  });

  it("flags forbidden investment copy in product files", () => {
    const result = analyzeSpecDiff(
      diffFor("apps/fomo-web/components/StockSwipeDeck.tsx", ["+const label = '지금 매수 기회예요';"]),
      { guardDiscoveryRan: true },
    );

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("constitution.forbidden_copy");
  });

  it("does not treat regex guard definitions as user-facing generic copy", () => {
    const result = analyzeSpecDiff(
      diffFor("apps/fomo-web/components/StockSwipeDeck.tsx", [
        "-const SURFACE_PRICE_HOOK_PATTERN = /(?:움직였어요|먼저 움직|강하게 움직|거래량|순매수)/;",
        "+const SURFACE_PRICE_HOOK_PATTERN = /(?:^오늘 가격이|^가격 먼저 움직임$)/;",
      ]),
      { guardDiscoveryRan: true },
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain("diff.generic_overwrite");
    expect(result.ok).toBe(true);
  });

  it("does not merge concrete removals and generic guard additions from different files", () => {
    const result = analyzeSpecDiff(
      [
        diffFor("apps/web/lib/discovery-supply.ts", [
          "-  return `오늘 ${sector} 12개 종목 중 가장 먼저 움직였어요.`;",
          "+  return `오늘 ${sector} 12개 종목 중 상대강도 1위예요.`;",
        ]),
        diffFor("packages/fomo-core/src/keyword-cards/discovery-supply.ts", [
          "+function isPriceRestatement(text: string): boolean {",
          "+  return /^오늘\\s*가격이|^가격\\s*먼저\\s*움직임$/.test(text);",
          "+}",
        ]),
      ].join("\n"),
      { guardDiscoveryRan: true },
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain("diff.generic_overwrite");
    expect(result.ok).toBe(true);
  });

  it("requires discovery guard for sensitive discovery files", () => {
    const result = analyzeSpecDiff(diffFor("apps/web/lib/discovery-supply.ts", ["+const limit = 50;"]));

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain("guard.discovery_required");
  });

  it("passes a normal non-product refactor", () => {
    const result = analyzeSpecDiff(diffFor("scripts/knowledge-base.ts", ["-const x = 1;", "+const value = 1;"]));

    expect(result.ok).toBe(true);
  });
});

function diffFor(file: string, lines: readonly string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,1 +1,1 @@",
    ...lines,
    "",
  ].join("\n");
}
