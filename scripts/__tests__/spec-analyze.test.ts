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
