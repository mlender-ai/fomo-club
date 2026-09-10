import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INV-14 — 렌더 경로에서 계산·외부 fetch·LLM 임포트 금지.
 *
 * ## 왜 기존 가드로 부족했나 (실측)
 *
 * `apps/web/__tests__/lib/*-request-path-guard.test.ts` 두 개가 이미 있지만 범위가 좁다.
 *  1. **`apps/fomo-web` 을 스캔하지 않는다.** 그런데 사용자가 실제로 보는 렌더 표면은 거기다.
 *  2. **아키타입 모듈이 어느 금지 목록에도 없다** — `classifyArchetype` 은 팩트시트를 받아
 *     규칙을 돌리는 계산이므로 렌더 경로에 있으면 안 된다.
 *  3. LLM 호출(`callAI`)이 목록에 없다.
 *
 * 기존 가드를 지우지 않고 **승격**한다(지시서 A-1: "새로 만들지 말고 기존 것을 승격"). 이 파일은
 * 기존 두 가드가 덮지 않는 축 — 클라이언트 렌더 표면과 아키타입·LLM — 만 담당한다.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CLIENT_ROOT = join(REPO_ROOT, "apps", "fomo-web");

/** 렌더 표면에 있으면 안 되는 것. 배럴 임포트로 들어와도 식별자로 잡힌다. */
const FORBIDDEN_IN_RENDER = [
  // 계산 조립
  "assembleFactSheet",
  "buildFactSheet",
  "buildBusinessContext",
  "classifyArchetype",
  "applyHysteresis",
  "computeBands",
  // 외부 fetch
  "fetchNaverFundamentals",
  "fetchSecFundamentals",
  "fetchNasdaqFundamentals",
  "fetchBusinessSection",
  "fetchVariableObservations",
  // LLM
  "callAI",
  "synthesizeSlots",
  "verifySentence",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".next-build" || entry === "e2e") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** 임포트/호출로 쓰인 경우만. 주석·문자열 안의 언급은 위반이 아니다. */
function usesIdentifier(source: string, identifier: string): boolean {
  return new RegExp(`(?:import[^;]*\\b${identifier}\\b|\\b${identifier}\\s*\\()`).test(stripComments(source));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("INV-14 렌더 경로 (클라이언트 표면)", () => {
  const files = walk(CLIENT_ROOT).filter((file) => !relative(CLIENT_ROOT, file).startsWith("__tests__"));

  it("스캔 대상이 실재한다 — 0개면 가드가 아무것도 지키지 않는다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("계산·외부 fetch·LLM 을 임포트하지 않는다", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const identifier of FORBIDDEN_IN_RENDER) {
        if (usesIdentifier(source, identifier)) offenders.push(`${relative(REPO_ROOT, file)}: ${identifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("의도적 위반 케이스에서 실패한다 — 규칙을 지워도 초록이 되지 않게", () => {
    const bad = `import { classifyArchetype } from "@fomo/core";\nexport const x = classifyArchetype(sheet);`;
    expect(FORBIDDEN_IN_RENDER.some((identifier) => usesIdentifier(bad, identifier))).toBe(true);
    // 주석·문자열 언급은 위반이 아니다(오탐이 잦으면 가드는 무력화된다).
    expect(usesIdentifier(`// classifyArchetype 는 배치에서만 쓴다`, "classifyArchetype")).toBe(false);
    expect(usesIdentifier(`const label = "callAI";`, "callAI")).toBe(false);
  });
});
