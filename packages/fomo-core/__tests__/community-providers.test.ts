import { describe, it, expect } from "vitest";
import {
  fetchCommunity,
  COMMUNITY_PROVIDERS,
  type CommunityProvider,
  type CommunitySourceSignal,
} from "../src/index-engine/community";
import { communityHeat } from "../src/index-engine/communityHeat";
import { whaleEventsFromCrypto } from "../src/index-engine/whaleEvents";

const sig = (source: string, bullish: number): CommunitySourceSignal => ({
  source,
  postCount: 10,
  totalUpvotes: 100,
  totalComments: 20,
  bullishRatio: bullish,
  fetchedAt: "2026-06-08T00:00:00Z",
});

describe("COMMUNITY_PROVIDERS 레지스트리", () => {
  it("Reddit 라이브 + X/Telegram/Toss/Naver 스캐폴드 등록", () => {
    const ids = COMMUNITY_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["reddit", "x", "telegram", "toss", "naver"]));
    expect(COMMUNITY_PROVIDERS.find((p) => p.id === "reddit")!.enabled).toBe(true);
    expect(COMMUNITY_PROVIDERS.find((p) => p.id === "x")!.enabled).toBe(false);
  });
});

describe("fetchCommunity (provider 주입)", () => {
  it("enabled provider 만 수집, providersAvailable 은 실제 시그널 반환 수", async () => {
    const providers: CommunityProvider[] = [
      { id: "reddit", label: "Reddit", enabled: true, fetch: async () => [sig("reddit/wsb", 0.7)] },
      { id: "x", label: "X", enabled: true, fetch: async () => [] }, // enabled지만 0건
      { id: "toss", label: "Toss", enabled: false, fetch: async () => [sig("toss/x", 0.9)] }, // disabled → 무시
    ];
    const r = await fetchCommunity(providers);
    expect(r.providersTotal).toBe(3);
    expect(r.providersEnabled).toBe(2);
    expect(r.providersAvailable).toBe(1); // reddit만 시그널
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]!.source).toBe("reddit/wsb");
  });

  it("provider fetch 가 throw 해도 전체는 죽지 않음(정직한 폴백)", async () => {
    const providers: CommunityProvider[] = [
      { id: "x", label: "X", enabled: true, fetch: async () => { throw new Error("api down"); } },
      { id: "reddit", label: "Reddit", enabled: true, fetch: async () => [sig("reddit/a", 0.5)] },
    ];
    const r = await fetchCommunity(providers);
    expect(r.providersAvailable).toBe(1);
    expect(r.sources).toHaveLength(1);
  });
});

describe("communityHeat — sources 채널 반영", () => {
  it("sources 가 engagement 풀에 들어가 폴백을 벗어난다", () => {
    const h = communityHeat({ sources: [sig("x/$NVDA", 0.8), sig("reddit/wsb", 0.6)] });
    expect(h.meta!.confidence).not.toBe("fallback");
    expect(h.score).toBeGreaterThan(0);
  });
  it("입력 없으면 폴백 유지(기존 동작)", () => {
    expect(communityHeat({}).meta!.confidence).toBe("fallback");
  });
});

describe("whaleEventsFromCrypto", () => {
  it("±8%↑ 변동만 이벤트, BTC 가중 +1", () => {
    const ev = whaleEventsFromCrypto({
      coins: [
        { symbol: "BTC", change24h: 16 }, // 15+ → 3, +BTC 1 = 4
        { symbol: "ETH", change24h: -9 }, // 8~15 → 2
        { symbol: "XRP", change24h: 3 }, // 무시
      ],
    });
    expect(ev).toHaveLength(2);
    expect(ev.find((e) => e.label!.includes("BTC"))!.weight).toBe(4);
    expect(ev.find((e) => e.label!.includes("ETH"))!.weight).toBe(2);
  });
  it("글로벌 시총 ±5%↑ → 이벤트 1건 추가", () => {
    const ev = whaleEventsFromCrypto({ coins: [], marketCapChangePct: -6 });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.weight).toBe(2);
  });
  it("변동 없으면 빈 배열(정직 — 가짜 이벤트 없음)", () => {
    expect(whaleEventsFromCrypto({ coins: [{ symbol: "BTC", change24h: 1 }] })).toEqual([]);
  });
});
