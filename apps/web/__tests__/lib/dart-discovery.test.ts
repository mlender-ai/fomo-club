import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * DART 구조 덤프 가드.
 *
 * 이 라우트의 목적은 **구조를 그대로 남기는 것**이다(WO-SUB-00: 확보율을 세기 전에 구조를 먼저 본다).
 * 그래서 지켜야 할 것 두 가지만 잠근다 —
 *   1. 키가 없으면 조용히 성공하지 않는다(`keyPresent: false`).
 *   2. 응답에 **키를 실어 보내지 않는다**(url 마스킹).
 */

const ORIGINAL_KEY = process.env.DART_API_KEY;

describe("DART 구조 덤프", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.DART_API_KEY;
    else process.env.DART_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it("키가 없으면 조사하지 않고 그 사실을 남긴다 — 조용한 빈 성공 금지", async () => {
    delete process.env.DART_API_KEY;
    delete process.env.DART_CRTFC_KEY;
    const { discoverDartStructure } = await import("../../lib/fundamentals/dart-discovery");
    const result = await discoverDartStructure("185750");
    expect(result.keyPresent).toBe(false);
    expect(result.dumps).toEqual([]);
    expect(result.corpCode).toBeNull();
  });

  it("덤프 URL 에서 크레덴셜을 지운다 — 응답으로 키가 새지 않아야 한다", async () => {
    process.env.DART_API_KEY = "SECRET_KEY_VALUE";
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "013", message: "조회된 데이타가 없습니다.", list: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const { discoverDartStructure } = await import("../../lib/fundamentals/dart-discovery");
    const result = await discoverDartStructure("185750");
    expect(result.keyPresent).toBe(true);
    expect(result.dumps.length).toBeGreaterThan(0);
    for (const dump of result.dumps) {
      expect(dump.url).not.toContain("SECRET_KEY_VALUE");
      expect(dump.url).toContain("crtfc_key=***");
    }
    expect(JSON.stringify(result)).not.toContain("SECRET_KEY_VALUE");
  });
});
