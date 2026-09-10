import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * WO-RESET-08 §E-3 — **업종 흐름 카드는 분류가 틀리면 통째로 거짓이 된다.**
 *
 * 그래서 카드보다 분류표를 먼저 만들었다. 실측(2026-08-28, 유니버스 809):
 * 큐레이션 사전 8.2% · 시세 힌트 0% · 나머지 91.8% 무분류. 그 8%마저 **테마**였다
 * (`코인` 이 들어 있었다 — `한화투자증권 = 코인` 사고의 원인).
 */
const responses = new Map<string, unknown>();
vi.stubGlobal("fetch", async (input: string | URL) => {
  const url = String(input);
  const key = [...responses.keys()].find((k) => url.includes(k));
  if (!key) return new Response("", { status: 404 });
  return new Response(JSON.stringify(responses.get(key)), { status: 200 });
});

const { buildSectorMap, fetchSectorGroups } = await import("../../lib/sector-map");

beforeEach(() => responses.clear());
afterEach(() => responses.clear());

describe("업종 분류표 — 테마가 아니라 산업분류다", () => {
  it("업종 목록을 페이지 끝까지 넘긴다", async () => {
    responses.set("industry?page=1", { groups: [{ no: 1, name: "반도체와반도체장비" }], totalCount: 2 });
    responses.set("industry?page=2", { groups: [{ no: 2, name: "은행" }], totalCount: 2 });
    responses.set("industry?page=3", { groups: [] });
    expect((await fetchSectorGroups()).map((g) => g.name)).toEqual(["반도체와반도체장비", "은행"]);
  });

  it("업종별 종목을 모아 종목코드 → 업종명 표를 만든다", async () => {
    responses.set("industry?page=1", { groups: [{ no: 278, name: "반도체와반도체장비" }], totalCount: 1 });
    responses.set("industry/278", { stocks: [{ itemCode: "005930" }, { itemCode: "000660" }] });
    const map = await buildSectorMap("2026-08-28");
    expect(map.byCode["005930"]).toBe("반도체와반도체장비");
    expect(map.counts["반도체와반도체장비"]).toBe(2);
  });

  it("한 종목이 여러 업종에 나오면 **먼저 만난 업종**을 쓴다 — 실행마다 값이 달라지면 집계가 흔들린다", async () => {
    responses.set("industry?page=1", { groups: [{ no: 1, name: "먼저" }, { no: 2, name: "나중" }], totalCount: 2 });
    responses.set("industry/1", { stocks: [{ itemCode: "005930" }] });
    responses.set("industry/2", { stocks: [{ itemCode: "005930" }] });
    const map = await buildSectorMap("2026-08-28");
    expect(map.byCode["005930"]).toBe("먼저");
    expect(map.counts["나중"]).toBeUndefined();
  });

  it("종목코드 형태가 아니면 버린다 — 6자리 숫자만 종목이다", async () => {
    responses.set("industry?page=1", { groups: [{ no: 1, name: "은행" }], totalCount: 1 });
    responses.set("industry/1", { stocks: [{ itemCode: "005930" }, { itemCode: "" }, { itemCode: "ABCD" }] });
    expect(Object.keys((await buildSectorMap("2026-08-28")).byCode)).toEqual(["005930"]);
  });

  it("조회가 실패하면 **사유를 남긴다** — 조용히 빈 표를 만들지 않는다", async () => {
    const map = await buildSectorMap("2026-08-28");
    expect(map.errors[0]).toContain("업종 목록 조회 실패");
    expect(Object.keys(map.byCode)).toEqual([]);
  });

  it("업종에 종목이 0개면 그 사실을 남긴다", async () => {
    responses.set("industry?page=1", { groups: [{ no: 9, name: "빈업종" }], totalCount: 1 });
    responses.set("industry/9", { stocks: [] });
    const map = await buildSectorMap("2026-08-28");
    expect(map.errors.some((e) => e.includes("빈업종"))).toBe(true);
  });
});
