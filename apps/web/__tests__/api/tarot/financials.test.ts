import { describe, it, expect, vi, beforeEach } from "vitest";

// 검증 항목:
//   1. symbol 누락 → 400
//   2. 정상 응답 — profile, quarterlyEarnings, annualFinancials, keyMetrics 전부 반환
//   3. keyMetrics 결측 — Yahoo에서 일부 모듈 미지원 시 null 반환 (0 vs null 구분)
//   4. 외부 API 502 → 502 패스스루
//   5. result 없음 → 404
//   6. 캐시 — 동일 symbol 두 번째 호출은 외부 fetch 없이 캐시 응답
//   7. annualFinancials — grossProfit, ebitda 필드 포함 여부

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET } from "@/app/api/tarot/financials/route";
import { NextRequest } from "next/server";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function fullYahooFinancialsPayload() {
  return {
    quoteSummary: {
      result: [
        {
          summaryProfile: {
            sector: "Technology",
            industry: "Consumer Electronics",
            fullTimeEmployees: 161000,
            longBusinessSummary: "Apple Inc. designs, manufactures, and markets smartphones.",
            website: "https://www.apple.com",
          },
          earnings: {
            financialsChart: {
              quarterly: [
                { date: "2Q2024", revenue: { raw: 90_753_000_000 }, earnings: { raw: 21_448_000_000 } },
                { date: "3Q2024", revenue: { raw: 94_930_000_000 }, earnings: { raw: 23_874_000_000 } },
              ],
            },
          },
          incomeStatementHistory: {
            incomeStatementHistory: [
              {
                endDate: { fmt: "2024-09-28" },
                totalRevenue: { raw: 391_035_000_000 },
                operatingIncome: { raw: 123_216_000_000 },
                netIncome: { raw: 93_736_000_000 },
                grossProfit: { raw: 180_683_000_000 },
                ebitda: { raw: 134_661_000_000 },
              },
              {
                endDate: { fmt: "2023-09-30" },
                totalRevenue: { raw: 383_285_000_000 },
                operatingIncome: { raw: 114_301_000_000 },
                netIncome: { raw: 96_995_000_000 },
                grossProfit: { raw: 169_148_000_000 },
                ebitda: { raw: 123_000_000_000 },
              },
            ],
          },
          financialData: {
            totalDebt: { raw: 101_304_000_000 },
            totalCash: { raw: 54_820_000_000 },
            currentRatio: { raw: 0.87 },
            quickRatio: { raw: 0.83 },
            returnOnAssets: { raw: 0.225 },
            profitMargins: { raw: 0.239 },
            grossMargins: { raw: 0.462 },
            freeCashflow: { raw: 90_000_000_000 },
          },
          defaultKeyStatistics: {
            trailingEps: { raw: 6.43 },
            bookValue: { raw: 3.77 },
            priceToSalesTrailing12Months: { raw: 8.5 },
            pegRatio: { raw: 2.3 },
          },
          cashflowStatementHistory: {
            cashflowStatements: [
              { freeCashflow: { raw: 90_000_000_000 } },
            ],
          },
        },
      ],
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("/api/tarot/financials", () => {
  it("symbol 누락 → 400", async () => {
    const res = await GET(makeRequest("http://localhost/api/tarot/financials"));
    expect(res.status).toBe(400);
  });

  it("정상 응답 — profile, quarterlyEarnings, annualFinancials, keyMetrics 전부 반환", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fullYahooFinancialsPayload(),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=FIN1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.profile).toBeDefined();
    expect(body.profile.sector).toBe("Technology");
    expect(body.profile.employees).toBe(161000);
    expect(Array.isArray(body.quarterlyEarnings)).toBe(true);
    expect(body.quarterlyEarnings.length).toBe(2);
    expect(Array.isArray(body.annualFinancials)).toBe(true);
    expect(body.annualFinancials.length).toBe(2);
    expect(body.keyMetrics).toBeDefined();
  });

  it("annualFinancials — grossProfit, ebitda 필드 포함", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fullYahooFinancialsPayload(),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=FIN2"));
    const body = await res.json();

    const latest = body.annualFinancials[body.annualFinancials.length - 1];
    expect(latest.grossProfit).toBe(180_683_000_000);
    expect(latest.ebitda).toBe(134_661_000_000);
    expect(latest.year).toBe("2024");
  });

  it("annualFinancials — oldest first (reverse 정렬)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fullYahooFinancialsPayload(),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=FIN3"));
    const body = await res.json();

    const years = body.annualFinancials.map((f: { year: string }) => f.year);
    expect(years[0]).toBe("2023");
    expect(years[1]).toBe("2024");
  });

  it("keyMetrics — 값 정확히 반환", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fullYahooFinancialsPayload(),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=FIN4"));
    const body = await res.json();
    const km = body.keyMetrics;

    expect(km.eps).toBe(6.43);
    expect(km.bookValue).toBe(3.77);
    expect(km.currentRatio).toBe(0.87);
    expect(km.quickRatio).toBe(0.83);
    expect(km.totalDebt).toBe(101_304_000_000);
    expect(km.totalCash).toBe(54_820_000_000);
    expect(km.profitMargins).toBe(0.239);
    expect(km.grossMargins).toBe(0.462);
    expect(km.returnOnAssets).toBe(0.225);
    expect(km.pegRatio).toBe(2.3);
    expect(km.priceToSalesTrailing12Months).toBe(8.5);
  });

  it("keyMetrics 결측 — Yahoo에서 defaultKeyStatistics 없을 때 null 반환", async () => {
    const payload = fullYahooFinancialsPayload();
    delete (payload.quoteSummary.result[0] as Record<string, unknown>).defaultKeyStatistics;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=MISS1"));
    const body = await res.json();

    expect(body.keyMetrics.eps).toBeNull();
    expect(body.keyMetrics.bookValue).toBeNull();
    expect(body.keyMetrics.pegRatio).toBeNull();
    // financialData에서 채워지는 필드는 여전히 있어야 함
    expect(body.keyMetrics.currentRatio).toBe(0.87);
  });

  it("외부 API 502 → 502 패스스루", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    const res = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=ERR1"));
    expect(res.status).toBe(502);
  });

  it("result 없음 → 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ quoteSummary: { result: [] } }),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=EMPTY1"));
    expect(res.status).toBe(404);
  });

  it("캐시 — 동일 symbol 두 번째 호출은 외부 fetch 없이 캐시 응답", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fullYahooFinancialsPayload(),
    });

    const r1 = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=CACHE1"));
    expect(r1.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const r2 = await GET(makeRequest("http://localhost/api/tarot/financials?symbol=CACHE1"));
    expect(r2.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
