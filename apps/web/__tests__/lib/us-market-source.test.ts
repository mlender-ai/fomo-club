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

  it("uses Twelve Data movers while keeping the keyed request path capped", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "td-test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("market_movers") && url.includes("type=gainers")) {
        return Response.json({ values: [{ symbol: "MRVL" }, { symbol: "OPEN" }] });
      }
      if (url.includes("market_movers") && url.includes("type=losers")) {
        return Response.json({ values: [{ symbol: "SNDK" }, { symbol: "KULR" }] });
      }
      if (url.includes("market_movers") && url.includes("type=most_active")) {
        return Response.json({ values: [{ symbol: "META" }, { symbol: "SERV" }] });
      }
      if (url.includes("quote")) {
        return Response.json({
          MRVL: { symbol: "MRVL", price: "75.20", change: "4.42", percent_change: "6.25", volume: "23000000", exchange: "NASDAQ" },
          SNDK: { symbol: "SNDK", price: "60.10", change: "-3.15", percent_change: "-4.98", volume: "190000000", exchange: "NASDAQ" },
          META: { symbol: "META", price: "705.80", change: "12.20", percent_change: "1.76", volume: "85000000", exchange: "NASDAQ" },
          OPEN: { symbol: "OPEN", price: "2.80", change: "0.42", percent_change: "17.65", volume: "23000000", exchange: "NASDAQ" },
          KULR: { symbol: "KULR", price: "1.10", change: "-0.15", percent_change: "-12.00", volume: "190000000", exchange: "NYSE" },
          SERV: { symbol: "SERV", price: "18.80", change: "2.20", percent_change: "13.25", volume: "85000000", exchange: "NASDAQ" },
        });
      }
      if (url.includes("time_series")) {
        return Response.json({});
      }
      return Response.json({});
    });
    const { fetchUsMarketDiagnostics, fetchUsMarketRows } = await import("../../lib/us-market-source");

    const rows = await fetchUsMarketRows();
    expect(rows.some((row) => row.symbol === "MRVL")).toBe(true);
    expect(rows.some((row) => row.symbol === "SNDK")).toBe(true);
    expect(rows.some((row) => row.symbol === "META")).toBe(true);
    expect(rows.some((row) => row.symbol === "OPEN")).toBe(true);
    expect(rows.some((row) => row.symbol === "KULR")).toBe(true);
    expect(rows.some((row) => row.symbol === "SERV")).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("market_movers"))).toBe(true);

    const diag = await fetchUsMarketDiagnostics();
    expect(diag.moverSymbols).toBe(6);
    expect(diag.dynamicRows).toBeGreaterThanOrEqual(6);
    expect(diag.quoteSymbols).toBeLessThanOrEqual(60);
    expect(diag.quoteSymbols).toBeLessThan(diag.seedCount);
  });

  it("uses Nasdaq screener as a dynamic no-key universe before curated seeds", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/screener/stocks")) {
        return Response.json({
          data: {
            rows: [
              {
                symbol: "MRVL",
                name: "Marvell Technology Inc Common Stock",
                lastsale: "$75.20",
                netchange: "0.42",
                pctchange: "6.25%",
                volume: "23000000",
                marketCap: "60000000000",
                country: "United States",
                sector: "Technology",
                industry: "Semiconductors",
              },
              {
                symbol: "META",
                name: "Meta Platforms Inc Class A Common Stock",
                lastsale: "$705.80",
                netchange: "-0.15",
                pctchange: "-1.20%",
                volume: "190000000",
                marketCap: "1800000000000",
                country: "United States",
                sector: "Technology",
                industry: "Internet Services",
              },
              {
                symbol: "OPEN",
                name: "Opendoor Technologies Inc Common Stock",
                lastsale: "$2.80",
                netchange: "0.42",
                pctchange: "17.65%",
                volume: "23000000",
                marketCap: "2000000000",
                country: "United States",
                sector: "Technology",
                industry: "Computer Software",
              },
              {
                symbol: "AACB",
                name: "Artius II Acquisition Inc Class A Ordinary Shares",
                lastsale: "$10.49",
                netchange: "0.00",
                pctchange: "0.00%",
                volume: "560",
                marketCap: "0",
                country: "United States",
                sector: "",
                industry: "Blank Checks",
              },
            ],
          },
        });
      }
      return Response.json({ data: { tradesTable: { rows: [] } } });
    });
    const { fetchUsMarketDiagnostics, fetchUsMarketRows } = await import("../../lib/us-market-source");

    const rows = await fetchUsMarketRows();
    expect(rows.map((row) => row.symbol)).toEqual(expect.arrayContaining(["MRVL", "META"]));
    expect(rows.some((row) => row.symbol === "OPEN")).toBe(false);
    expect(rows.some((row) => row.symbol === "AACB")).toBe(false);
    expect(rows.find((row) => row.symbol === "MRVL")?.changePct).toBe(6.25);
    expect(rows.find((row) => row.symbol === "MRVL")?.canonical).toBe("마벨테크놀로지");

    const diag = await fetchUsMarketDiagnostics();
    expect(diag.source).toBe("nasdaq-screener");
    expect(diag.dynamicRows).toBeGreaterThanOrEqual(2);
    expect(diag.strongMomentumRows).toBe(0);
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
