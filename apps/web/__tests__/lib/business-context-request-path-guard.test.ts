import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WO-SUB-03 완료 조건 4 · §9 — **카드/디테일 렌더 경로에서 LLM 호출이 발생하지 않는다.**
 *
 * 합성은 배치 전용이다. 요청 시점 LLM 호출은 비용·결정론 양쪽에서 실패한다(§3 규칙 7).
 * WO-SUB-01 의 팩트시트 가드와 같은 방식으로, eslint 플러그인 없이 테스트로 감시한다.
 */

const WEB_ROOT = join(__dirname, "..", "..");

/** 요청 경로에 있으면 안 되는 합성 함수. */
const FORBIDDEN_IDENTIFIERS = [
  "synthesizeSlots",
  "verifySentence",
  "verifiedSentence",
  "buildBusinessContext",
  "fetchBusinessSection",
  "fetchVariableObservations",
];

/** 합성이 허용된 경로. */
const ALLOWED_PREFIXES = ["lib/business-context/", "app/api/fomo/cron/", "__tests__/"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".next-build" || entry === "e2e") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("사업 실체 합성은 요청 경로에 없다", () => {
  it("카드·덱·뎁스 렌더 경로가 합성·LLM 함수를 부르지 않는다", () => {
    const offenders: Array<{ file: string; identifier: string }> = [];
    for (const file of walk(WEB_ROOT)) {
      const rel = relative(WEB_ROOT, file).split("\\").join("/");
      if (ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
      const source = readFileSync(file, "utf8");
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        if (new RegExp(`\\b${identifier}\\b`).test(source)) offenders.push({ file: rel, identifier });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("저장소는 LLM 을 부르지 않는다 — 읽기 전용 경로", () => {
    const source = readFileSync(join(WEB_ROOT, "lib/business-context/repository.ts"), "utf8");
    expect(source).not.toMatch(/callAI|synthesize/);
  });

  it("프롬프트는 번들에서만 온다 — 런타임 fs 읽기 금지(Vercel 파일 트레이싱 의존 제거)", () => {
    for (const name of ["synthesize.ts", "build.ts"]) {
      const source = readFileSync(join(WEB_ROOT, "lib/business-context", name), "utf8");
      expect(source).not.toMatch(/readFileSync|prompts\//);
    }
  });
});
