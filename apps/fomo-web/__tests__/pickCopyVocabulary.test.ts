import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PICK_BANNED_TERMS, findBannedTerms } from "@fomo/core";

/**
 * WO-SUB-HOOK PART 5 · 완료 조건 10 — **용어 사전이 화면에서 지켜지는지 전역 스캔.**
 *
 * ## 무엇을 스캔하나
 *
 * 픽 표면(카드·덱·뎁스·"이게 틀리는 경우")과 그 문구를 만드는 엔진 파일의 **사용자 노출
 * 문자열**이다. 주석은 제외한다 — 화면에 나가지 않고, 결함의 역사(무엇이 왜 바뀌었는지)를
 * 적어 두는 자리라 금지어가 등장할 수밖에 없다.
 *
 * 스캔 범위를 픽 표면으로 한정한 이유: 레거시 30장 덱·키워드 뎁스는 이 WO 범위가 아니다
 * (`하지 않을 것` — 화면을 깨뜨리지 않는 결함은 등재만). 픽 표면이 지금의 주 화면이다.
 */

const FILES = [
  "../components/QuietPickCard.tsx",
  "../components/QuietPickDeck.tsx",
  "../components/QuietPickDepth.tsx",
  "../components/WhereThisIsWrong.tsx",
] as const;

/**
 * 문구를 만드는 엔진. `company-summary.ts` 는 여기 없다 — 그 파일의 문자열은 화면 문구가
 * 아니라 **바꿔야 할 옛 어미의 목록**(`하였음` → `했어요`)이라 사전에 걸리는 것이 정상이다.
 * 대신 그 함수의 **출력**을 `company-summary.test.ts` 가 금지어로 검사한다.
 */
const CORE_FILES = [
  "../../../packages/fomo-core/src/keyword-cards/quiet-pick-hook.ts",
] as const;

/** 주석 제거 — 블록 주석과 줄 주석. 남는 것이 화면으로 나갈 수 있는 문자열이다. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function read(path: string): string {
  return withoutComments(readFileSync(new URL(path, import.meta.url), "utf8"));
}

describe("픽 화면 용어 사전 (PART 5)", () => {
  it.each([...FILES, ...CORE_FILES])("%s 에 금지어가 없다", (path) => {
    const hits = findBannedTerms(read(path));
    expect(hits, `금지어 잔존: ${hits.join(", ")}`).toEqual([]);
  });

  it("사전에 대체어가 빠짐없이 붙어 있다 — 금지만 하고 대안을 안 주면 지켜지지 않는다", () => {
    for (const entry of PICK_BANNED_TERMS) {
      expect(entry.replacement.length, entry.term).toBeGreaterThan(0);
      expect(entry.why.length, entry.term).toBeGreaterThan(0);
    }
  });

  it("대체어 자체가 금지어를 다시 부르지 않는다", () => {
    for (const entry of PICK_BANNED_TERMS) {
      if (entry.replacement.startsWith("(")) continue; // "(문장 재작성)"
      const hits = findBannedTerms(entry.replacement).filter((hit) => hit !== entry.term);
      expect(hits, `${entry.term} → ${entry.replacement}`).toEqual([]);
    }
  });
});

describe("뎁스 카피 (PART 3)", () => {
  const depth = read("../components/QuietPickDepth.tsx");

  it("훅은 뎁스에서 한 번만 렌더된다 (완료 조건 11)", () => {
    // 훅 렌더는 `pickHook(pick)` 한 곳뿐이다(옛 payload 복구를 거친다).
    expect(depth.match(/>\{pickHook\(pick\)\}</g) ?? []).toHaveLength(1);
    expect(depth).not.toContain("{pick.hook}");
  });

  it("빈 대시 대신 '아직'과 채점 전 안내를 쓴다 (PART 3-4 · 완료 조건 9)", () => {
    expect(depth).toContain('"아직"');
    expect(depth).toContain("발행한 지 얼마 안 돼 아직 채점 전이에요");
    // 종전 폴백(빈 대시)이 남아 있지 않다.
    expect(depth).not.toContain('.toFixed(1)}%` : "—"');
  });

  it("재무 섹션에 밴드 캡션·유형 경고문이 배선돼 있다 (D8 · 완료 조건 7)", () => {
    expect(depth).toContain("frame={slotPayload?.valuation_frame ?? null}");
    const glance = read("../components/KeywordDepthPage.tsx");
    expect(glance).toContain('data-testid="valuation-band-caption"');
    expect(glance).toContain('data-testid="valuation-type-warning"');
  });

  it("회사 요약은 벤더 원문을 그대로 쓰지 않는다 (PART 3-3 · 완료 조건 8)", () => {
    const glance = read("../components/KeywordDepthPage.tsx");
    expect(glance).toContain("rewriteCompanySummary(cleanText(basics.summary))");
    expect(glance).toContain("출처 보기");
  });
});
