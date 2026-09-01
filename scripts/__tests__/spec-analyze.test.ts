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

  it("allows investment judgment copy while the dev override is active", () => {
    const result = analyzeSpecDiff(
      diffFor("apps/fomo-web/components/StockSwipeDeck.tsx", ["+const label = '지금 매수 기회예요';"]),
      { guardDiscoveryRan: true, investmentJudgmentConstraintsLifted: true },
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain("constitution.forbidden_copy");
    expect(result.ok).toBe(true);
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

  /**
   * 2026-09-01 실제 오검출(MACRO-01) — 업종 목록이 **자리만 옮겼는데** 제거로 잡히고,
   * 같은 파일에 새로 쓴 JSDoc 의 「움직임」이 제네릭으로 잡혀 둘이 짝지어졌다.
   * 목록에서 빠진 값은 하나도 없었다. 주석은 화면에 안 나간다.
   */
  it("does not treat doc comments as user-facing generic copy", () => {
    const result = analyzeSpecDiff(
      diffFor("packages/fomo-core/src/keyword-cards/macro-link.ts", [
        '-    upHurts: ["항공사", "화학", "운송인프라", "육상운송"],',
        "+  /** 이 움직임에 유리한 쪽의 우리 종목. */",
        '+    upHurts: ["항공사", "화학", "운송인프라", "육상운송"],',
      ]),
      { guardDiscoveryRan: true },
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain("diff.generic_overwrite");
    expect(result.ok).toBe(true);
  });

  /** 꼬리 주석으로는 못 피한다 — 줄 맨 앞이 주석 기호일 때만 뺀다. */
  it("still flags generic copy hidden behind a trailing comment", () => {
    const result = analyzeSpecDiff(
      diffFor("apps/web/lib/discovery-supply.ts", [
        "-  return `오늘 ${sector} 12개 종목 중 가장 먼저 신호가 잡혔어요.`;",
        "+  return `오늘 ${sector} 흐름에서 먼저 확인된 종목이에요.`; // 문구 정리",
      ]),
      { guardDiscoveryRan: true },
    );

    expect(result.findings.map((finding) => finding.code)).toContain("diff.generic_overwrite");
  });

  /**
   * 이 저장소의 작업지시는 `docs/wo/` 에 산다. 종전 정규식은 `docs/WO-` 만 봐서 한 번도
   * 만족된 적이 없었고, 그래서 이 경고가 모든 PR 에 떴다 — 늘 뜨는 경고는 아무도 안 읽는다.
   */
  it("counts docs/wo/ as the spec change it is", () => {
    const result = analyzeSpecDiff(
      [
        "diff --git a/apps/web/lib/quiet-pick.ts b/apps/web/lib/quiet-pick.ts",
        "+const changed = 1;",
        "diff --git a/docs/wo/WO-EXAMPLE.md b/docs/wo/WO-EXAMPLE.md",
        "+작업지시를 적었다",
      ].join("\n"),
      { guardDiscoveryRan: true },
    );

    expect(result.findings.map((finding) => finding.code)).not.toContain("spec.coverage_missing");
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
