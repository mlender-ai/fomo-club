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
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((row) => row.country !== "KR" && row.symbol && row.currency === "USD")).toBe(true);
    expect(rows.every((row) => row.priceText === undefined && row.changePct === undefined && row.changeText === undefined)).toBe(true);
    expect(rows.some((row) => row.symbol === "SMCI")).toBe(true);
    expect(rows.some((row) => row.sectorHint === "양자")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hydrates US quotes and sparklines without Yahoo chart endpoints", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "td-test");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("market_movers")) {
        return Response.json({ values: [{ symbol: "SMCI" }, { symbol: "IONQ" }] });
      }
      if (url.includes("quote")) {
        return Response.json({
          SMCI: { symbol: "SMCI", price: "49.20", change: "3.10", percent_change: "6.72", volume: "23000000", exchange: "NASDAQ" },
          IONQ: { symbol: "IONQ", price: "38.10", change: "1.20", percent_change: "3.25", volume: "18000000", exchange: "NYSE" },
          NVDA: { symbol: "NVDA", price: "150.00", change: "1.00", percent_change: "0.67", volume: "100000000", exchange: "NASDAQ" },
        });
      }
      if (url.includes("time_series")) {
        return Response.json({
          SMCI: { values: [{ datetime: "2026-06-27", close: "49.2" }, { datetime: "2026-06-26", close: "46.1" }] },
          IONQ: { values: [{ datetime: "2026-06-27", close: "38.1" }, { datetime: "2026-06-26", close: "36.9" }] },
        });
      }
      return Response.json({});
    });
    const { fetchUsMarketRows } = await import("../../lib/us-market-source");

    const rows = await fetchUsMarketRows();
    const smci = rows.find((row) => row.symbol === "SMCI");
    expect(smci?.priceText).toBe("$49.20");
    expect(smci?.changePct).toBe(6.72);
    expect(smci?.sparkline).toEqual([46.1, 49.2]);
    expect(smci?.sectorHint).toBe("AI");
  });

  it("does not wire Yahoo chart endpoints into the US quote adapter", () => {
    const source = readFileSync(fileURLToPath(new URL("../../lib/us-market-source.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/query[12]\.finance\.yahoo\.com|chart\/|finance\.yahoo\.com\/v8/i);
  });
});
