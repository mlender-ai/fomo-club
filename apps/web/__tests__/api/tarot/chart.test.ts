import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 검증 항목 (QA 이슈 #240 차트 데이터 정합성 테스트):
//   1. symbol 누락 → 400
//   2. range 무효 → 400 + 허용 목록 안내
//   3. 정상 응답 — bars 배열 정렬·필드 완비
//   4. close가 null인 바는 스킵 (조용히 누락 처리)
//   5. close가 NaN/Infinity 같은 비정상 값일 때도 스킵 (Number.isFinite 가드)
//   6. open/high/low가 null이면 close 값으로 폴백
//   7. 동일 timestamp 중복 입력 — 모두 가공되지만 close 무결성 유지
//   8. timestamps 배열은 있는데 quote 데이터 자체가 비어있을 때 bars=[]
//   9. 외부 API 502 → 502 패스스루
//   10. 외부 API result 없음 → 404
//   11. 캐시 — 같은 (symbol, range, interval) 두 번째 호출은 외부 fetch 없이 응답

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GET } from "@/app/api/tarot/chart/route";
import { NextRequest } from "next/server";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

interface YahooBar {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

function yahooChartPayload(timestamps: number[], bars: YahooBar[]) {
  return {
    chart: {
      result: [
        {
          meta: { currency: "USD", symbol: "TEST", exchangeName: "NMS" },
          timestamp: timestamps,
          indicators: {
            quote: [
              {
                open: bars.map((b) => b.open),
                high: bars.map((b) => b.high),
                low: bars.map((b) => b.low),
                close: bars.map((b) => b.close),
                volume: bars.map((b) => b.volume),
              },
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/tarot/chart", () => {
  it("symbol 누락 → 400", async () => {
    const res = await GET(makeRequest("http://localhost/api/tarot/chart"));
    expect(res.status).toBe(400);
  });

  it("range 무효 → 400 + 허용 목록 안내", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=AAPL&range=99y"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid range");
    expect(body.error).toContain("1d");
  });

  it("정상 응답 — bars 배열 + 필드 완비", async () => {
    const ts = [1_700_000_000, 1_700_086_400, 1_700_172_800];
    const bars: YahooBar[] = [
      { open: 100, high: 105, low: 99, close: 102, volume: 1_000_000 },
      { open: 102, high: 108, low: 101, close: 107, volume: 1_200_000 },
      { open: 107, high: 110, low: 106, close: 109, volume: 900_000 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload(ts, bars),
    });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=NORMAL1&range=1mo"),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.bars).toHaveLength(3);
    expect(body.bars[0]).toMatchObject({ open: 100, high: 105, low: 99, close: 102, volume: 1_000_000 });
    expect(typeof body.bars[0].date).toBe("string");
    expect(() => new Date(body.bars[0].date)).not.toThrow();
    expect(body.meta.currency).toBe("USD");
    expect(body.meta.exchangeName).toBe("NMS");
  });

  it("close=null 인 바는 스킵 (결측치 안전 처리)", async () => {
    const ts = [1_700_000_000, 1_700_086_400, 1_700_172_800];
    const bars: YahooBar[] = [
      { open: 100, high: 105, low: 99, close: 102, volume: 1_000_000 },
      { open: 102, high: null, low: null, close: null, volume: 0 },
      { open: 107, high: 110, low: 106, close: 109, volume: 900_000 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload(ts, bars),
    });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=NULL1&range=1mo"),
    );
    const body = await res.json();
    expect(body.bars).toHaveLength(2);
    expect(body.bars[0].close).toBe(102);
    expect(body.bars[1].close).toBe(109);
  });

  it("close=NaN / Infinity 등 비정상 값도 스킵 (Number.isFinite 가드)", async () => {
    const ts = [1_700_000_000, 1_700_086_400, 1_700_172_800, 1_700_259_200];
    const bars: YahooBar[] = [
      { open: 100, high: 105, low: 99, close: 102, volume: 1_000_000 },
      { open: 100, high: 105, low: 99, close: Number.NaN, volume: 0 },
      { open: 100, high: 105, low: 99, close: Number.POSITIVE_INFINITY, volume: 0 },
      { open: 107, high: 110, low: 106, close: 109, volume: 900_000 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload(ts, bars),
    });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=BAD1&range=1mo"),
    );
    const body = await res.json();
    expect(body.bars).toHaveLength(2);
    expect(body.bars.map((b: { close: number }) => b.close)).toEqual([102, 109]);
  });

  it("open/high/low가 null이면 close 값으로 폴백", async () => {
    const ts = [1_700_000_000];
    const bars: YahooBar[] = [
      { open: null, high: null, low: null, close: 100, volume: 0 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload(ts, bars),
    });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=FALLBACK1&range=1mo"),
    );
    const body = await res.json();
    expect(body.bars).toHaveLength(1);
    expect(body.bars[0]).toMatchObject({ open: 100, high: 100, low: 100, close: 100 });
  });

  it("동일 timestamp 중복 입력 — close가 유효한 모든 바를 보존 (가공 일관성)", async () => {
    const sameTs = 1_700_000_000;
    const ts = [sameTs, sameTs, sameTs];
    const bars: YahooBar[] = [
      { open: 100, high: 105, low: 99, close: 102, volume: 1_000_000 },
      { open: 102, high: 106, low: 101, close: 103, volume: 0 },
      { open: 103, high: 107, low: 102, close: 104, volume: 0 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload(ts, bars),
    });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=DUP1&range=1mo"),
    );
    const body = await res.json();
    expect(body.bars).toHaveLength(3);
    // 같은 timestamp이지만 변환은 안전하게 동작
    expect(body.bars.every((b: { close: number }) => Number.isFinite(b.close))).toBe(true);
  });

  it("timestamps 있지만 quote 비어있음 → bars=[] (크래시 없음)", async () => {
    const payload = {
      chart: {
        result: [
          {
            meta: { currency: "USD", symbol: "TEST" },
            timestamp: [1_700_000_000, 1_700_086_400],
            indicators: { quote: [] },
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=EMPTY1&range=1mo"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bars).toEqual([]);
    expect(body.meta.currency).toBe("USD");
  });

  it("외부 API 502 → 502 패스스루", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=ERR1&range=1mo"),
    );
    expect(res.status).toBe(502);
  });

  it("외부 API result 없음 → 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ chart: { result: [] } }),
    });

    const res = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=NORESULT1&range=1mo"),
    );
    expect(res.status).toBe(404);
  });

  it("캐시 — 같은 (symbol, range, interval) 두 번째 호출은 외부 fetch 없이 응답", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload([1_700_000_000], [
        { open: 100, high: 105, low: 99, close: 102, volume: 1_000_000 },
      ]),
    });

    const r1 = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=CACHE1&range=1mo"),
    );
    expect(r1.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const r2 = await GET(
      makeRequest("http://localhost/api/tarot/chart?symbol=CACHE1&range=1mo"),
    );
    expect(r2.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1); // 캐시 hit

    const body = await r2.json();
    expect(body.bars).toHaveLength(1);
  });

  it("다른 range는 별도 캐시 — 같은 symbol 다른 range는 새 fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload([1_700_000_000], [
        { open: 100, high: 105, low: 99, close: 102, volume: 1_000_000 },
      ]),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => yahooChartPayload([1_700_000_000], [
        { open: 200, high: 210, low: 195, close: 205, volume: 500_000 },
      ]),
    });

    await GET(makeRequest("http://localhost/api/tarot/chart?symbol=MULTIRANGE&range=1mo"));
    await GET(makeRequest("http://localhost/api/tarot/chart?symbol=MULTIRANGE&range=1y"));

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
