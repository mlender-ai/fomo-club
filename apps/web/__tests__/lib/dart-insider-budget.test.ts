import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * 내부자 스캔 시간 예산 (WO-OPS-504 PHASE 2).
 *
 * 이 스캔은 완전 직렬이다 — 7일 × 최대 3페이지(목록) + 항목별 문서 fetch. **상한이 없었다.**
 * 프리뷰 실측(2026-08-15)에서 `discovery?country=KR` 이 이 단계에서 19.97초를 쓰고도 끝나지
 * 않아 25초 마감을 넘겼다. 공시가 쌓일수록 커지는 값이라 **"왜 하필 지금 임계를 넘었나"의
 * 답이 여기 있다.** 아래는 그 상한이 실제로 걸리는지를 잠근다.
 */

const ORIGINAL_KEY = process.env.DART_API_KEY;
const ORIGINAL_LIVE = process.env.DISCOVERY_DART_LIVE;

describe("DART 내부자 스캔 예산", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.DART_API_KEY;
    else process.env.DART_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_LIVE === undefined) delete process.env.DISCOVERY_DART_LIVE;
    else process.env.DISCOVERY_DART_LIVE = ORIGINAL_LIVE;
    vi.unstubAllGlobals();
  });

  it("느린 응답에도 예산 안에서 돌아온다 — 요청 경로를 무한히 붙잡지 않는다", async () => {
    process.env.DART_API_KEY = "K";
    delete process.env.DISCOVERY_DART_LIVE;
    let calls = 0;
    // 페이지마다 1.2초 — 예산(8초)이 없으면 7일 × 3페이지 = 25초 이상 걸린다.
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      return new Response(
        JSON.stringify({ status: "000", total_page: 3, list: [{ stock_code: "999999", report_nm: "기타", rcept_no: "1" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const { fetchDartInsiderPurchasesByStock } = await import("../../lib/dart-disclosures");
    const startedAt = Date.now();
    const result = await fetchDartInsiderPurchasesByStock("2026-08-15");
    const elapsed = Date.now() - startedAt;

    expect(result).toEqual({});
    // 예산 8초 + 진행 중이던 페이지 1건(1.2초) 여유. 예산이 없던 시절은 25초를 넘겼다.
    expect(elapsed).toBeLessThan(14_000);
    expect(calls).toBeGreaterThan(0);
  }, 30_000);

  it("키가 없으면 아무 호출도 하지 않는다", async () => {
    delete process.env.DART_API_KEY;
    delete process.env.DART_CRTFC_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { fetchDartInsiderPurchasesByStock } = await import("../../lib/dart-disclosures");
    expect(await fetchDartInsiderPurchasesByStock("2026-08-15")).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("US 스코프는 한국 공시를 기다리지 않는다", () => {
  it("US 분기에서 DART 스캔을 건너뛴다 — 결과가 100% 버려지는 대기였다", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../lib/discovery-supply.ts", import.meta.url), "utf8");
    expect(source).toContain('const dartScoped = scope !== "US"');
    // 두 DART 스캔 모두 게이트를 탄다.
    expect(source).toMatch(/dartScoped\s*\n?\s*\?\s*await timeStage\("dart-insider"/);
    expect(source).toMatch(/dartScoped\s*\n?\s*\?\s*await timeStage\("dart-disclosures"/);
  });
});
