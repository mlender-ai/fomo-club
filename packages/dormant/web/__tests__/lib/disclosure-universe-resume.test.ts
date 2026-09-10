import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 유니버스가 커지면 **과거를 다시 훑아야 한다** (2026-08-27 실측 사고).
 *
 * DART 목록은 하루치를 통째로 주고 우리가 유니버스로 걸러낸다. 그래서 유니버스가 커지면
 * **이미 본 날에도 새 종목이 걸린다.** 그런데 재개 로직은 `coveredFrom`(=날짜)만 보고
 * "이 날짜까지 봤다" 며 과거를 건너뛰었다.
 *
 * 결과: 유니버스를 66 → 809 로 늘렸는데 공시가 붙은 종목은 155에 머물렀고,
 * **덱 15장 중 공시 항목이 붙은 것이 0장**이었다. 2걸음이 통째로 빈 것이다.
 */
const src = readFileSync(new URL("../../lib/disclosure-collect.ts", import.meta.url), "utf8");

describe("공시 수집 — 커버리지는 날짜만이 아니라 **유니버스**도 기록한다", () => {
  it("훑은 유니버스 크기를 저장한다", () => {
    expect(src).toContain("coveredUniverse?: number;");
    expect(src).toContain("coveredUniverse: kr.truncated ? (previous?.coveredUniverse ?? 0) : krUniverseSize,");
  });

  it("유니버스가 커지면 과거 재개를 무시하고 다시 훑는다", () => {
    expect(src).toContain("const universeGrew = krUniverseSize > (previous?.coveredUniverse ?? 0) * 1.1;");
    expect(src).toContain("const covered = universeGrew ? undefined : previous?.coveredFrom;");
  });

  it("커졌으면 **이전 커버리지를 물려받지 않는다** — 안 본 과거를 봤다고 하면 거짓말이다", () => {
    expect(src).toContain("const previousFrom = universeGrew ? undefined : previous?.coveredFrom;");
  });

  it("잘린 수집은 유니버스 기록을 갱신하지 않는다 — 부분을 완전으로 적으면 영영 안 채워진다", () => {
    expect(src).toContain("kr.truncated ? (previous?.coveredUniverse ?? 0)");
  });

  it("구 저장분(필드 없음)은 0 으로 보아 다시 훑는다 — 안전한 쪽", () => {
    expect(src).toContain("previous?.coveredUniverse ?? 0");
  });
});
