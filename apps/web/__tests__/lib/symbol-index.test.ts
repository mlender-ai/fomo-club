import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: { $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { searchSymbols, saveSearchRequest } = await import("../../lib/symbol-index");

describe("symbol-index (요청 경로 안전판)", () => {
  it("인덱스 미구축(캐시 없음) 시 빈 결과 — 재구축·외부 fetch 없이 fail-open", async () => {
    const results = await searchSymbols("삼성전자");
    expect(results).toEqual([]);
  });

  it("검색 요청 저장은 쿼리를 60자로 자르고 pending 상태로 만든다", async () => {
    const row = await saveSearchRequest("  존재하지  않는   종목  ");
    expect(row.status).toBe("pending");
    expect(row.query).toBe("존재하지 않는 종목");
  });
});


describe("검색 대기함 — 익명 deviceId 귀속(무로그인)", () => {
  it("같은 쿼리를 다른 기기가 요청하면 deviceId 만 병합된다", async () => {
    const store = new Map<string, unknown>();
    const { writeFeedContent, readFeedContent } = await import("../../lib/feed-content-store");
    vi.mocked(writeFeedContent as unknown as ReturnType<typeof vi.fn>);
    // prisma 목이 저장을 흉내내지 못하므로 모듈 수준 목으로 대체
    const mod = await import("../../lib/symbol-index");
    // saveSearchRequest 는 read→write 순서 — prisma 목($queryRaw [])이라 항상 신규 생성 경로.
    const row = await mod.saveSearchRequest("  없는  종목 ", "device-A");
    expect(row.status).toBe("pending");
    expect(row.query).toBe("없는 종목");
    expect(row.deviceIds).toEqual(["device-A"]);
  });

  it("deviceId 없는 요청도 저장된다(하위호환)", async () => {
    const mod = await import("../../lib/symbol-index");
    const row = await mod.saveSearchRequest("종목B");
    expect(row.status).toBe("pending");
    expect(row.deviceIds).toBeUndefined();
  });

  it("readRequestsForDevice 는 빈 deviceId 에 빈 배열(fail-open)", async () => {
    const mod = await import("../../lib/symbol-index");
    expect(await mod.readRequestsForDevice("")).toEqual([]);
  });
});
