// Stock data types for ticker detail screen
// Used by both web API and mobile app

export interface StockQuote {
  symbol: string;
  shortName: string;
  longName: string;
  currency: string;
  exchange: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  // 결측 가능 — 외부 데이터 소스에서 누락 시 null. 0과 결측을 구분하기 위함.
  dayLow: number | null;
  dayHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  volume: number;
  averageVolume: number;
  // Phase 2: extended financials
  returnOnEquity?: number | null;
  grossMargins?: number | null;
  operatingMargins?: number | null;
  totalRevenue?: number | null;
  revenueGrowth?: number | null;
  debtToEquity?: number | null;
  // 응답 생성 시각 (ISO 8601). 캐시 신선도 추적용.
  dataAt: string;
}

export interface StockChartBar {
  date: string; // ISO date or timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockChartResponse {
  bars: StockChartBar[];
  meta: {
    currency: string;
    symbol: string;
    exchangeName?: string;
  };
}
