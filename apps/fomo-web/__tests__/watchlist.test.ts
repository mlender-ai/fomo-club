import { afterEach, describe, expect, it, vi } from "vitest";
import { getWatchlist, toggleWatch, upsertWatch } from "../lib/watchlist";

const storage = new Map<string, string>();

function installLocalStorage() {
  storage.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  storage.clear();
});

describe("watchlist discovery metadata", () => {
  it("keeps old watchlist rows readable while dropping malformed values", () => {
    installLocalStorage();
    storage.set(
      "fomo_watchlist",
      JSON.stringify([
        { stock: "삼성SDI", ts: 100 },
        { stock: "대주전자재료", ts: 200, sector: "2차전지", reason: "같은 흐름에서 같이 움직인 종목이에요." },
        { stock: 123, ts: 300 },
      ])
    );

    expect(getWatchlist()).toEqual([
      { stock: "대주전자재료", ts: 200, sector: "2차전지", reason: "같은 흐름에서 같이 움직인 종목이에요." },
      { stock: "삼성SDI", ts: 100 },
    ]);
  });

  it("upserts discovery metadata by stock", () => {
    installLocalStorage();

    upsertWatch("대주전자재료", 100, { sector: "2차전지", reason: "첫 이유" });
    upsertWatch("대주전자재료", 200, { sector: "2차전지", reason: "갱신된 이유" });

    expect(getWatchlist()).toEqual([
      { stock: "대주전자재료", ts: 200, sector: "2차전지", reason: "갱신된 이유" },
    ]);
  });

  it("toggleWatch stores metadata on add and removes the item on the next toggle", () => {
    installLocalStorage();

    expect(toggleWatch("한미반도체", 100, { sector: "반도체", reason: "보여주는 이유" })).toBe(true);
    expect(getWatchlist()[0]).toMatchObject({ stock: "한미반도체", sector: "반도체", reason: "보여주는 이유" });

    expect(toggleWatch("한미반도체", 200)).toBe(false);
    expect(getWatchlist()).toEqual([]);
  });
});
