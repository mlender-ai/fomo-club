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

/**
 * 합성이 허용된 경로 — **배치 경로**다.
 *
 * `lib/risk/` 를 추가한 이유(WO-SUB-06.5): 리스크 합성 배치가 `verifySentence` 를 재사용한다.
 * §5-2 가 "WO-SUB-03 과 동일한 근거 검증 패스" 를 요구하므로 검증기를 두 벌 두지 않는 것이
 * 의도된 설계다(배치끼리 어댑터를 재사용하는 것은 팩트시트 어댑터 선례와 같다).
 *
 * 허용 범위를 넓힌 대가로 아래 두 단정을 추가했다 — 이 디렉터리 안의 **읽기 전용 파일**과
 * **렌더 경로**가 합성으로 오염되지 않는지 본다. 넓히기만 하면 가드가 약해진다.
 */
const ALLOWED_PREFIXES = ["lib/business-context/", "lib/risk/", "app/api/fomo/cron/", "__tests__/"];

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

  /**
   * 단정을 **호출·임포트로** 좁혔다. 종전에는 `/callAI|synthesize/` 로 봤는데 그건 필드명
   * `synthesized_at`(합성 시각 타임스탬프)까지 잡는 오탐이었다. 규칙의 의도는 "저장소가 LLM 을
   * 부르거나 합성 모듈을 끌어오지 않는다" 이므로 그것만 본다.
   */
  it("저장소는 LLM 을 부르지 않는다 — 읽기 전용 경로", () => {
    for (const path of ["lib/business-context/repository.ts", "lib/risk/repository.ts"]) {
      const source = readFileSync(join(WEB_ROOT, path), "utf8");
      expect(source, `${path}: callAI 호출`).not.toMatch(/callAI\s*\(/);
      expect(source, `${path}: 합성 모듈 임포트`).not.toMatch(/from ".*synthesize"/);
    }
  });

  /**
   * `lib/risk/` 를 허용 목록에 넣었으므로 그 디렉터리에서 렌더 경로로 새는 길을 따로 막는다.
   * 카드 슬롯 페이로드는 **저장소만** 읽어야 한다 — 합성·소스취득을 부르면 요청 시점에 LLM·SEC·
   * DART 가 붙는다(INV-14 위반).
   */
  it("카드 슬롯 페이로드는 리스크 저장소만 읽는다 — 합성·배치를 부르지 않는다", () => {
    const source = readFileSync(join(WEB_ROOT, "lib/card-slots/payload.ts"), "utf8");
    expect(source).toContain('from "../risk/repository"');
    for (const forbidden of ["risk/synthesize", "risk/build", "risk/refresh", "risk/dart-risk-section"]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("프롬프트는 번들에서만 온다 — 런타임 fs 읽기 금지(Vercel 파일 트레이싱 의존 제거)", () => {
    for (const name of ["synthesize.ts", "build.ts"]) {
      const source = readFileSync(join(WEB_ROOT, "lib/business-context", name), "utf8");
      expect(source).not.toMatch(/readFileSync|prompts\//);
    }
    for (const name of ["synthesize.ts", "build.ts", "refresh.ts"]) {
      const source = readFileSync(join(WEB_ROOT, "lib/risk", name), "utf8");
      expect(source, `risk/${name}`).not.toMatch(/readFileSync/);
    }
  });
});
