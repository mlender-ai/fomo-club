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

describe("뎁스 카피 — DS-03", () => {
  const depth = read("../components/QuietPickDepth.tsx");

  it("결론은 뎁스에서 한 번만 렌더된다 (DS-03 완료 기준 2)", () => {
    // `{hook}` 은 1걸음에서 한 번만 그려진다. (요약은 문자열을 가공해 쓰므로 이 패턴이 아니다.)
    expect(depth.match(/^\s*\{hook\}$/gm) ?? []).toHaveLength(1);
    expect(depth).not.toContain("{pick.hook}");
  });

  it("`아직` 류 채점 상태 문구가 사라졌다 (DS-03 완료 기준 7)", () => {
    expect(depth).not.toContain('"아직"');
    expect(depth).not.toContain("7일 아직");
    expect(depth).not.toContain("채점 전이에요");
    // 「우리 기록」은 화면에서 뺐다(WO-RESET-02 PART D) — 계산 모듈은 남고 상세가 안 부른다.
    expect(depth).not.toContain("computeOurRecord(");
  });

  it("밴드는 「왜 지금」 상태줄에만 남았다 — 「값」 섹션은 3걸음이 대체했다 (WO-RESET-05 §4)", () => {
    // 밴드 자체는 계속 읽는다 — `whyNowStateEvents` 가 특이할 때만 한 줄을 붙인다.
    expect(depth).toContain("const band = valuation?.band ?? null");
    expect(depth).toContain("whyNowStateEvents");
    // 맨숫자를 늘어놓던 자리는 사라졌다.
    expect(depth).not.toContain('data-testid="depth-band"');
    expect(depth).not.toContain('data-testid="depth-archetype-warning"');
    expect(depth).not.toContain('data-testid="depth-value"');
  });

  it("회사 설명은 벤더 원문을 그대로 쓰지 않고 출처를 남긴다 (DS-03 §6)", () => {
    expect(depth).toContain("companyBlurb(basics?.summary)");
    expect(depth).toContain("출처 보기");
  });
});
