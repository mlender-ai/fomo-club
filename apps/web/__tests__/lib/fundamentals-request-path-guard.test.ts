import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WO-SUB-01 §4 규칙 5 · §12 — **카드 요청 경로에서 팩트시트를 계산하지 않는다.**
 *
 * 과거 사고(lite API path 결손으로 롱테일이 `quiet` 로 폴백)와 같은 계열의 실패를 막기 위한
 * 구조 가드다. eslint 플러그인을 새로 만들지 않고 테스트로 감시한다 — 이 레포는 이미
 * `guard:discovery` 처럼 스크립트/테스트로 불변식을 지키는 방식을 쓴다.
 *
 * 허용 위치: 팩트시트 모듈 자신 · 배치 크론 · 대시보드 API · 백필 스크립트 · 테스트.
 */

const WEB_ROOT = join(__dirname, "..", "..");

/** 요청 경로에 있으면 안 되는 계산 함수 이름. `@fomo/core` 배럴로 들어와도 잡힌다. */
const FORBIDDEN_IDENTIFIERS = [
  "assembleFactSheet",
  "emptyFactSheet",
  "composeFiscal",
  "composeTtm",
  "computeBands",
  "buildFactSheet",
  "buildKrFactSheet",
  "buildUsFactSheet",
  "refreshFactSheetsChunk",
  "fetchSecFundamentals",
  "fetchNaverFundamentals",
  "fetchDartFundamentals",
  "fetchNasdaqFundamentals",
];

/** 계산이 허용된 경로(레포 루트 기준 상대경로 접두사). */
const ALLOWED_PREFIXES = [
  "lib/fundamentals/",
  // 사업 실체 합성(WO-SUB-03)도 배치 경로다 — 팩트시트 어댑터를 소스 수집에 재사용한다.
  // 이 가드가 막는 것은 **요청 경로**의 계산이고, 배치끼리의 재사용은 의도된 것이다.
  "lib/business-context/",
  "app/api/fomo/cron/fundamentals/",
  "app/api/fomo/fundamentals/",
  "__tests__/",
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

describe("팩트시트 계산은 요청 경로에 없다", () => {
  const offenders: Array<{ file: string; identifier: string }> = [];
  for (const file of walk(WEB_ROOT)) {
    const rel = relative(WEB_ROOT, file).split("\\").join("/");
    if (ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
    const source = readFileSync(file, "utf8");
    for (const identifier of FORBIDDEN_IDENTIFIERS) {
      if (new RegExp(`\\b${identifier}\\b`).test(source)) offenders.push({ file: rel, identifier });
    }
  }

  it("카드·덱·뎁스 렌더 경로가 팩트시트 계산 함수를 부르지 않는다", () => {
    expect(offenders).toEqual([]);
  });

  it("대시보드 API 는 저장소만 읽는다(소스 재조회 금지)", () => {
    const route = readFileSync(join(WEB_ROOT, "app/api/fomo/fundamentals/coverage/route.ts"), "utf8");
    expect(route).not.toMatch(/fetch\(/);
    expect(route).toMatch(/buildCoverageReport/);
  });

  it("커버리지 계산부는 어댑터를 import 하지 않는다", () => {
    const coverage = readFileSync(join(WEB_ROOT, "lib/fundamentals/coverage.ts"), "utf8");
    for (const adapter of ["sec-xbrl", "naver-fundamentals", "nasdaq-fundamentals", "./build"]) {
      expect(coverage).not.toContain(adapter);
    }
  });
});
