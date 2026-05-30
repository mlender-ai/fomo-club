import { describe, it, expect, vi, beforeEach } from "vitest";

// 검증 항목:
//   1. symbol 누락 → 400
//   2. 정상 응답 — headline, summary, cardName, orientation 필드 존재
//   3. 캐시 — 같은 symbol 두 번째 호출은 동일 데이터 반환 (LLM 재호출 없음)
//   4. LLM 실패 시 폴백 — headline/summary 가 빈 문자열 아님 (프리빌트 폴백 동작)
//   5. 외부 market fetch 실패 → 500

// fetchMarketSnapshot 과 LLM fetch 모두 모킹
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/tarot/market", () => ({
  fetchMarketSnapshot: vi.fn(),
}));

import { GET } from "@/app/api/tarot/news-insight/route";
import { fetchMarketSnapshot } from "@/lib/tarot/market";
import { NextRequest } from "next/server";
import type { MarketSnapshot } from "@taro/core";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function makeMarketSnapshot(overrides?: Partial<MarketSnapshot>): MarketSnapshot {
  return {
    ticker: "AAPL",
    market: "US",
    price: 200,
    changePercent: 1.5,
    volume: 50_000_000,
    condition: "bullish",
    summary: "AAPL 200 (+1.50%) — 강세",
    ...overrides,
  };
}

function makeLlmResponse(headline = "상승 기운이 흐릅니다", summary = "긍정적 흐름") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ headline, summary }) } }],
    }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.mocked(fetchMarketSnapshot).mockReset();
});

describe("/api/tarot/news-insight", () => {
  it("symbol 누락 → 400", async () => {
    const res = await GET(makeRequest("http://localhost/api/tarot/news-insight"));
    expect(res.status).toBe(400);
  });

  it("정상 응답 — 필수 필드 모두 존재", async () => {
    vi.mocked(fetchMarketSnapshot).mockResolvedValueOnce(makeMarketSnapshot());
    // quote API 내부 fetch (financials 컨텍스트용) + LLM 호출
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ symbol: "AAPL", grossMargins: 0.45, revenueGrowth: 0.05, returnOnEquity: 1.5, operatingMargins: 0.3, debtToEquity: 150 }) })
      .mockResolvedValueOnce(makeLlmResponse());

    const res = await GET(makeRequest("http://localhost/api/tarot/news-insight?symbol=RESP1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(typeof body.headline).toBe("string");
    expect(body.headline.length).toBeGreaterThan(0);
    expect(typeof body.summary).toBe("string");
    expect(body.summary.length).toBeGreaterThan(0);
    expect(typeof body.cardName).toBe("string");
    expect(["upright", "reversed"]).toContain(body.orientation);
  });

  it("LLM 실패 시 폴백 — headline/summary 비어있지 않음", async () => {
    vi.mocked(fetchMarketSnapshot).mockResolvedValueOnce(makeMarketSnapshot({ condition: "bearish" }));
    // quote fetch 실패 → financialCtx undefined
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      // LLM 호출도 실패 → 폴백
      .mockRejectedValueOnce(new Error("LLM timeout"));

    const res = await GET(makeRequest("http://localhost/api/tarot/news-insight?symbol=FALL1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(typeof body.headline).toBe("string");
    expect(body.headline.length).toBeGreaterThan(0);
    expect(["upright", "reversed"]).toContain(body.orientation);
  });

  it("외부 market fetch 실패 → 500", async () => {
    vi.mocked(fetchMarketSnapshot).mockRejectedValueOnce(new Error("Yahoo timeout"));
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    const res = await GET(makeRequest("http://localhost/api/tarot/news-insight?symbol=ERR1"));
    expect(res.status).toBe(500);
  });

  it("캐시 — 같은 symbol 두 번째 호출은 fetchMarketSnapshot 재호출 없음", async () => {
    vi.mocked(fetchMarketSnapshot).mockResolvedValueOnce(makeMarketSnapshot());
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce(makeLlmResponse("캐시 테스트 헤드라인", "캐시 테스트 요약"));

    const r1 = await GET(makeRequest("http://localhost/api/tarot/news-insight?symbol=CACHE99"));
    expect(r1.status).toBe(200);
    const b1 = await r1.json();

    // 두 번째 호출 — 캐시 hit이므로 fetchMarketSnapshot 한 번만 호출
    const r2 = await GET(makeRequest("http://localhost/api/tarot/news-insight?symbol=CACHE99"));
    expect(r2.status).toBe(200);
    const b2 = await r2.json();

    expect(vi.mocked(fetchMarketSnapshot)).toHaveBeenCalledTimes(1);
    expect(b1.headline).toBe(b2.headline);
    expect(b1.cardName).toBe(b2.cardName);
  });
});
