import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * §12 의 교훈을 팩트시트에도 건다 — **fail-open 을 스토어 안에 숨기지 않는다.**
 *
 * 수급 이력에서 같은 실수를 했었다: 스토어가 실패를 삼켜 빈 값을 돌려주니, 엔진의
 * `.catch()` 는 영영 안 걸리고 **"DB 가 죽었다" 와 "그날은 신호가 없었다" 가 구분되지
 * 않았다.** 팩트시트도 똑같았고(3걸음 0종목인데 `inputFailures` 는 비어 있었다),
 * 같은 방식으로 고친다.
 */
const repo = readFileSync(new URL("../../lib/fundamentals/repository.ts", import.meta.url), "utf8");
const engine = readFileSync(new URL("../../lib/quiet-pick.ts", import.meta.url), "utf8");

describe("팩트시트 조회 — 못 읽은 것과 없는 것을 가른다", () => {
  it("strict 판은 실패를 던진다 — 삼키지 않는다", () => {
    const fn = repo.slice(repo.indexOf("export async function readAllFactSheetsStrict"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toContain(".catch(");
  });

  it("삼키는 판은 남기되 **부르는 쪽이 고르게** 한다", () => {
    expect(repo).toContain("export async function readAllFactSheets(");
    expect(repo).toContain("readAllFactSheetsStrict(limit).catch(() => [])");
  });

  it("굽는 엔진은 strict 를 쓴다 — 장애가 `inputFailures` 로 드러나야 한다", () => {
    expect(engine).toContain("readAllFactSheets: readAllFactSheetsStrict,");
  });

  it("읽어온 개수를 진단에 남긴다 — 0 을 눈으로 볼 수 있어야 한다", () => {
    expect(engine).toContain("factSheets: factSheets.length,");
  });
});
