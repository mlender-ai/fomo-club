import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 검증 항목:
//   1. 정상 응답 — 모든 필드 채워짐, dataAt 존재, X-Data-Completeness=full
//   2. 결측치 — 외부 API에서 일부 필드 누락 → null 명시 + X-Data-Completeness 헤더에 누락 필드 콤마 명시
//   3. symbol 누락 → 400
//   4. 외부 API 502 → 502 패스스루
//   5. 외부 API result 없음 → 404
//   6. 캐시 — 같은 symbol 두 번째 호출은 외부 fetch 없이 캐시 응답
//   7. 결측치 발생 시 구조화 로그 (metric: quote_field_missing)

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET } from "@/app/api/tarot/quote/route";
import { NextRequest } from "next/server";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function fullYahooPayload() {
  return {
    quoteSummary: {
      result: [
        {
          price: {
            shortName: "Apple Inc.",
            longName: "Apple Inc.",
            currency: "USD",
            exchangeName: "NMS",
            regularMarketPrice: { raw: 200.5 },
            regularMarketPreviousClose: { raw: 198.0 },
            regularMarketChange: { raw: 2.5 },
            regularMarketChangePercent: { raw: 1.26 },
            marketCap: { raw: 3_000_000_000_000 },
          },
          summaryDetail: {
            dayLow: { raw: 199.0 },
            dayHigh: { raw: 201.5 },
            fiftyTwoWeekLow: { raw: 150.0 },
            fiftyTwoWeekHigh: { raw: 220.0 },
            trailingPE: { raw: 28.5 },
            volume: { raw: 50_000_000 },
            averageVolume: { raw: 45_000_000 },
            dividendYield: { raw: 0.005 },
          },
          defaultKeyStatistics: {
            forwardPE: { raw: 25.0 },
            priceToBook: { raw: 40.0 },
          },
          financialData: {
            returnOnEquity: { raw: 1.5 },
            grossMargins: { raw: 0.45 },
            operatingMargins: { raw: 0.3 },
            totalRevenue: { raw: 400_000_000_000 },
            revenueGrowth: { raw: 0.05 },
            debtToEquity: { raw: 150 },
          },
        },
      ],
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/tarot/quote", () => {
  it("symbol 누락 → 400", async () => {
    const res = await GET(makeRequest("http://localhost/api/tarot/quote"));
    expect(res.status).toBe(400);
  });

  it("정상 응답 — 모든 필드 채워짐 + dataAt + X-Data-Completeness=full", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fullYahooPayload(),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=FULL1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.symbol).toBe("FULL1");
    expect(body.currentPrice).toBe(200.5);
    expect(body.dayLow).toBe(199.0);
    expect(body.dayHigh).toBe(201.5);
    expect(body.fiftyTwoWeekLow).toBe(150.0);
    expect(body.fiftyTwoWeekHigh).toBe(220.0);
    expect(body.marketCap).toBe(3_000_000_000_000);
    expect(typeof body.dataAt).toBe("string");
    expect(() => new Date(body.dataAt)).not.toThrow();
    expect(Number.isNaN(new Date(body.dataAt).getTime())).toBe(false);

    expect(res.headers.get("X-Data-Completeness")).toBe("full");
  });

  it("결측치 — dayLow / dayHigh / 52주 / marketCap 누락 시 null + X-Data-Completeness 헤더에 명시", async () => {
    const payload = fullYahooPayload();
    const r = payload.quoteSummary.result[0]!;
    // 의도적 누락
    delete (r.summaryDetail as { dayLow?: unknown }).dayLow;
    delete (r.summaryDetail as { dayHigh?: unknown }).dayHigh;
    delete (r.summaryDetail as { fiftyTwoWeekLow?: unknown }).fiftyTwoWeekLow;
    delete (r.summaryDetail as { fiftyTwoWeekHigh?: unknown }).fiftyTwoWeekHigh;
    delete (r.price as { marketCap?: unknown }).marketCap;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=MISS1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.dayLow).toBeNull();
    expect(body.dayHigh).toBeNull();
    expect(body.fiftyTwoWeekLow).toBeNull();
    expect(body.fiftyTwoWeekHigh).toBeNull();
    expect(body.marketCap).toBeNull();

    const completeness = res.headers.get("X-Data-Completeness") ?? "";
    expect(completeness).toContain("dayLow");
    expect(completeness).toContain("dayHigh");
    expect(completeness).toContain("fiftyTwoWeekLow");
    expect(completeness).toContain("fiftyTwoWeekHigh");
    expect(completeness).toContain("marketCap");
  });

  it("결측치 발생 시 구조화 로그 출력 (metric: quote_field_missing)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const payload = fullYahooPayload();
    delete (payload.quoteSummary.result[0]!.price as { marketCap?: unknown }).marketCap;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    await GET(makeRequest("http://localhost/api/tarot/quote?symbol=LOG1"));

    const calls = warnSpy.mock.calls.map((c) => String(c[0]));
    const found = calls.find((c) => c.includes("quote_field_missing") && c.includes("marketCap") && c.includes("LOG1"));
    expect(found).toBeTruthy();
  });

  it("외부 API 502 → 502 패스스루", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=ERR1"));
    expect(res.status).toBe(502);
  });

  it("외부 API result 없음 → 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ quoteSummary: { result: [] } }),
    });

    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=EMPTY1"));
    expect(res.status).toBe(404);
  });

  it("캐시 — 같은 symbol 두 번째 호출은 외부 fetch 없이 캐시 응답", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => fullYahooPayload(),
    });

    const r1 = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=CACHE1"));
    expect(r1.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const r2 = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=CACHE1"));
    expect(r2.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const body = await r2.json();
    expect(body.symbol).toBe("CACHE1");
    expect(typeof body.dataAt).toBe("string");
  });

  // ─── 추가 회귀 (QA 우선순위 #8) ──────────────────────────────────────────────

  it("부분 결측 — marketCap만 누락 → completeness=\"marketCap\"", async () => {
    const payload = fullYahooPayload();
    delete (payload.quoteSummary.result[0]!.price as { marketCap?: unknown }).marketCap;

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });

    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=PART1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.marketCap).toBeNull();
    expect(body.dayLow).toBe(199.0); // 다른 필드는 보존
    expect(res.headers.get("X-Data-Completeness")).toBe("marketCap");
  });

  it("부분 결측 — 52주 두 필드만 누락 → completeness=\"fiftyTwoWeekLow,fiftyTwoWeekHigh\"", async () => {
    const payload = fullYahooPayload();
    const r = payload.quoteSummary.result[0]!;
    delete (r.summaryDetail as { fiftyTwoWeekLow?: unknown }).fiftyTwoWeekLow;
    delete (r.summaryDetail as { fiftyTwoWeekHigh?: unknown }).fiftyTwoWeekHigh;

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });

    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=PART2"));
    const body = await res.json();
    expect(body.fiftyTwoWeekLow).toBeNull();
    expect(body.fiftyTwoWeekHigh).toBeNull();
    expect(body.marketCap).toBe(3_000_000_000_000);
    expect(res.headers.get("X-Data-Completeness")).toBe("fiftyTwoWeekLow,fiftyTwoWeekHigh");
  });

  it("X-Cache 헤더 — 첫 호출 MISS, 두 번째 HIT", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fullYahooPayload() });

    const r1 = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=CACHE2"));
    expect(r1.headers.get("X-Cache")).toBe("MISS");

    const r2 = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=CACHE2"));
    expect(r2.headers.get("X-Cache")).toBe("HIT");
  });

  it("X-Cache 헤더는 캐시 응답에서도 completeness 보존", async () => {
    const payload = fullYahooPayload();
    delete (payload.quoteSummary.result[0]!.price as { marketCap?: unknown }).marketCap;
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });

    const r1 = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=CACHE3"));
    expect(r1.headers.get("X-Data-Completeness")).toBe("marketCap");

    // 두 번째 호출 — 캐시 hit이지만 completeness 동일 유지
    const r2 = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=CACHE3"));
    expect(r2.headers.get("X-Cache")).toBe("HIT");
    expect(r2.headers.get("X-Data-Completeness")).toBe("marketCap");
  });

  it("외부 fetch 예외(timeout) → 500 + 메시지 전달", async () => {
    mockFetch.mockRejectedValueOnce(new Error("AbortError: signal timed out"));

    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=TIMEOUT1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("AbortError");
  });

  it("응답 본문에 알려지지 않은 추가 필드 없음 — 스키마 안정성", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fullYahooPayload() });
    const res = await GET(makeRequest("http://localhost/api/tarot/quote?symbol=SCHEMA1"));
    const body = await res.json();
    const expectedKeys = [
      "symbol", "shortName", "longName", "currency", "exchange",
      "currentPrice", "previousClose", "change", "changePercent",
      "dayLow", "dayHigh", "fiftyTwoWeekLow", "fiftyTwoWeekHigh", "marketCap",
      "trailingPE", "forwardPE", "priceToBook", "dividendYield",
      "volume", "averageVolume",
      "returnOnEquity", "grossMargins", "operatingMargins", "totalRevenue", "revenueGrowth", "debtToEquity",
      "dataAt",
    ];
    const actualKeys = Object.keys(body).sort();
    const unexpected = actualKeys.filter((k) => !expectedKeys.includes(k));
    expect(unexpected).toEqual([]);
  });
});
