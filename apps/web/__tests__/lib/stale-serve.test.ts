import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staleMark, snapshotId, withDeadline } from "../../lib/stale-serve";

/**
 * WO-OPS-504 PHASE 3 — 스테일 서빙.
 *
 * 실측 근거: `/api/fomo/discovery` 는 60초, `/api/fomo/daily-30` 은 301초에 잘려 504 를 냈고
 * (프리웜 `#1389`·`#207` 로그), 잘렸으므로 캐시도 못 채워 **스스로 회복하지 못했다.**
 * 여기서 고정하는 것은 "못 만들었을 때 무엇을 주는가" 하나다.
 */

describe("withDeadline", () => {
  it("마감 안에 끝나면 결과를 준다", async () => {
    expect(await withDeadline(Promise.resolve("built"), 1_000)).toBe("built");
  });

  it("마감을 넘기면 기다리지 않고 null 을 준다", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5_000));
    const started = Date.now();
    expect(await withDeadline(slow, 30)).toBeNull();
    // 느린 작업(5초)이 끝나기를 기다리지 않는다. 상한은 러너 지터를 감안해 넉넉히 둔다 —
    // 여기서 고정하려는 것은 "마감 후 즉시 반환"이지 정확한 밀리초가 아니다.
    expect(Date.now() - started).toBeLessThan(2_500);
  });

  it("작업이 던지면 그대로 전파한다 — 실패를 스테일로 감추지 않는다", async () => {
    await expect(withDeadline(Promise.reject(new Error("boom")), 1_000)).rejects.toThrow("boom");
  });
});

describe("스테일 표식", () => {
  it("언제 만든 것인지가 반드시 실린다", () => {
    const mark = staleMark("2026-08-14T07:00:00.000Z");
    expect(mark).toEqual({ stale: true, savedAt: "2026-08-14T07:00:00.000Z", reason: "build_deadline" });
  });

  it("스냅샷은 기존 캐시 테이블을 쓴다 — 새 테이블을 만들지 않는다", () => {
    expect(snapshotId("discovery:KR:full")).toBe("snapshot:discovery:KR:full");
  });
});

describe("라우트 배선", () => {
  const discovery = readFileSync(new URL("../../app/api/fomo/discovery/route.ts", import.meta.url), "utf8");
  const daily30 = readFileSync(new URL("../../app/api/fomo/daily-30/route.ts", import.meta.url), "utf8");

  it("두 라우트 모두 마감을 걸고 성공분을 저장한다", () => {
    for (const source of [discovery, daily30]) {
      expect(source).toContain("withDeadline(");
      expect(source).toContain("writeStaleSnapshot(");
      expect(source).toContain("readStaleSnapshot<");
    }
  });

  it("마감은 함수 제한보다 짧다 — 잘리기 전에 응답해야 한다", () => {
    // discovery: maxDuration 60 > 마감 25초
    expect(discovery).toMatch(/maxDuration = 60/);
    expect(discovery).toMatch(/BUILD_DEADLINE_MS = 25_000/);
    // daily-30: maxDuration 300 > 마감 45초
    expect(daily30).toMatch(/maxDuration = 300/);
    expect(daily30).toMatch(/BUILD_DEADLINE_MS = 45_000/);
  });

  it("스냅샷이 없으면 빈 200 을 만들지 않는다 — 기존 503 계약 유지", () => {
    for (const source of [discovery, daily30]) {
      expect(source).toContain("build deadline exceeded and no snapshot");
      expect(source).toContain("status: 503");
    }
  });

  it("스테일 응답에 표식이 붙는다", () => {
    for (const source of [discovery, daily30]) {
      expect(source).toContain("staleMark(snapshot.savedAt)");
    }
  });
});
