import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("US market source", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses a verified seed universe without synthetic quotes when Twelve Data key is absent", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { fetchUsMarketRows } = await import("../../lib/us-market-source");

    const rows = await fetchUsMarketRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.country !== "KR" && row.symbol && row.currency === "USD")).toBe(true);
    expect(rows.every((row) => row.priceText === undefined && row.changePct === undefined && row.changeText === undefined)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not wire Yahoo chart endpoints into the US quote adapter", () => {
    const source = readFileSync(fileURLToPath(new URL("../../lib/us-market-source.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/query[12]\.finance\.yahoo\.com|chart\/|finance\.yahoo\.com\/v8/i);
  });
});
