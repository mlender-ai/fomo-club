// 중앙화된 캐싱 정책 (#321)
// 모든 SWR 키 네이밍과 TTL 상수를 여기서 관리한다.
// 분산된 매직 넘버를 제거하고, 데이터 갱신 주기 기반으로 TTL을 차등 적용.

export const CachePolicy = {
  // 시세: 실시간 가격은 짧은 fresh TTL, stale은 3분까지 허용
  quote: {
    freshMs:   30 * 1000,        // 30초
    staleMs:    3 * 60 * 1000,   // 3분
  },

  // 재무: 분기 단위 갱신 → 길게 유지해 불필요한 API 호출 제거
  financials: {
    freshMs:   30 * 60 * 1000,       // 30분
    staleMs:    6 * 60 * 60 * 1000,  // 6시간
  },

  // 뉴스: 10분 fresh, stale은 40분까지
  news: {
    freshMs:   10 * 60 * 1000,   // 10분
    staleMs:   40 * 60 * 1000,   // 40분
  },
} as const;

// 차트 TTL은 봉 종류에 따라 다름 — 단기 봉은 장중 변화 잦음
export function chartCachePolicy(range: "1d" | "5d" | "1mo" | "3mo" | "1y"): { freshMs: number; staleMs: number } {
  const intraday = range === "1d" || range === "5d";
  return intraday
    ? { freshMs: 60 * 1000, staleMs: 5 * 60 * 1000 }            // 1분 / 5분
    : { freshMs: 30 * 60 * 1000, staleMs: 6 * 60 * 60 * 1000 }; // 30분 / 6시간
}

// 캐시 키 생성 — 종목 심볼과 데이터 종류를 조합한 결정적 키
export const CacheKey = {
  quote:      (symbol: string) => `quote:${symbol}`,
  financials: (symbol: string) => `financials:${symbol}`,
  chart:      (symbol: string, range: string) => `chart:${symbol}:${range}`,
  news:       (symbol: string) => `news:${symbol}`,
} as const;
