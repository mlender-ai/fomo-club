import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("US market source", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses Nasdaq daily data when Twelve Data key is absent", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.nasdaq.com") && url.includes("/SMCI/")) {
        return Response.json({
          data: {
            tradesTable: {
              rows: [
                { date: "06/26/2026", close: "$49.20", volume: "2,000" },
                { date: "06/25/2026", close: "$46.10", volume: "1,000" },
              ],
            },
          },
        });
      }
      if (url.includes("api.nasdaq.com") && url.includes("/IONQ/")) {
        return Response.json({
          data: {
            tradesTable: {
              rows: [
                { date: "06/26/2026", close: "$38.10", volume: "2,000" },
                { date: "06/25/2026", close: "$36.90", volume: "1,000" },
              ],
            },
          },
        });
      }
      return Response.json({ data: { tradesTable: { rows: [] } } });
    });
    const { fetchUsMarketRows } = await import("../../lib/us-market-source");

    const rows = await fetchUsMarketRows();
    expect(rows.length).toBe(2);
    expect(rows.every((row) => row.country !== "KR" && row.symbol && row.currency === "USD")).toBe(true);
    expect(rows.find((row) => row.symbol === "SMCI")?.priceText).toBe("$49.20");
    expect(rows.find((row) => row.symbol === "SMCI")?.sparkline).toEqual([46.1, 49.2]);
    expect(rows.find((row) => row.symbol === "IONQ")?.sectorHint).toBe("양자");
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

  it("keeps a verified no-price seed universe when all market data sources fail", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("blocked", { status: 403 }));
    const { fetchUsMarketRows } = await import("../../lib/us-market-source");

    const rows = await fetchUsMarketRows();
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.some((row) => row.symbol === "SMCI")).toBe(true);
    expect(rows.every((row) => row.priceText === undefined && row.changePct === undefined && row.changeText === undefined)).toBe(true);
  });
});
