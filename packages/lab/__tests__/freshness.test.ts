import { describe, expect, it } from "vitest";

import { describeAge, feedStatus, freshnessOf } from "../src/freshness";

const NOW = new Date("2026-09-13T12:00:00Z");
const STALE_MS = 3 * 60 * 1000;

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

describe("freshnessOf", () => {
  it("임계 안이면 fresh", () => {
    expect(freshnessOf({ symbol: "BTC", fetchedAt: ago(60_000) }, NOW, STALE_MS).status).toBe("fresh");
  });

  it("임계를 넘기면 stale", () => {
    expect(freshnessOf({ symbol: "BTC", fetchedAt: ago(STALE_MS + 1) }, NOW, STALE_MS).status).toBe("stale");
  });

  it("임계 정확히면 아직 fresh — 경계에서 깜빡이지 않는다", () => {
    expect(freshnessOf({ symbol: "BTC", fetchedAt: ago(STALE_MS) }, NOW, STALE_MS).status).toBe("fresh");
  });

  it("한 번도 못 받았으면 missing", () => {
    const result = freshnessOf({ symbol: "BTC", fetchedAt: null }, NOW, STALE_MS);
    expect(result.status).toBe("missing");
    expect(result.ageMs).toBeNull();
  });

  it("시계가 앞서 있어도 stale 로 만들지 않는다", () => {
    const future = new Date(NOW.getTime() + 60_000);
    expect(freshnessOf({ symbol: "BTC", fetchedAt: future }, NOW, STALE_MS).status).toBe("fresh");
  });
});

describe("feedStatus — 신규 진입 허용 여부", () => {
  it("전부 신선하면 ok", () => {
    const status = feedStatus(
      [
        { symbol: "BTC", fetchedAt: ago(1000) },
        { symbol: "ETH", fetchedAt: ago(2000) },
      ],
      NOW,
      STALE_MS
    );
    expect(status.ok).toBe(true);
    expect(status.blocked).toEqual([]);
  });

  it("하나라도 끊기면 전체를 막는다", () => {
    const status = feedStatus(
      [
        { symbol: "BTC", fetchedAt: ago(1000) },
        { symbol: "ETH", fetchedAt: ago(STALE_MS + 1) },
      ],
      NOW,
      STALE_MS
    );
    expect(status.ok).toBe(false);
    expect(status.blocked).toEqual(["ETH"]);
  });

  it("missing 도 막는다", () => {
    const status = feedStatus([{ symbol: "SOL", fetchedAt: null }], NOW, STALE_MS);
    expect(status.ok).toBe(false);
    expect(status.blocked).toEqual(["SOL"]);
  });

  it("종목이 하나도 없으면 ok 가 아니다 — 빈 피드는 신선한 게 아니다", () => {
    expect(feedStatus([], NOW, STALE_MS).ok).toBe(false);
  });
});

describe("describeAge", () => {
  it("사람이 읽는 단위로 낸다", () => {
    expect(describeAge(5_000)).toBe("5초 전");
    expect(describeAge(120_000)).toBe("2분 전");
    expect(describeAge(3 * 3600_000)).toBe("3시간 전");
    expect(describeAge(50 * 3600_000)).toBe("2일 전");
  });

  it("수신이 없으면 그렇게 말한다 — 0초 전이라고 하지 않는다", () => {
    expect(describeAge(null)).toBe("수신 없음");
  });
});
