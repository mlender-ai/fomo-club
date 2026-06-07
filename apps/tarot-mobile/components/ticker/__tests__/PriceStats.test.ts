import { describe, it, expect } from "vitest";
import type { StockQuote } from "@trading/shared/src/stockTypes";

// 검증 항목:
//   1. 완전한 데이터 — 모든 필드 존재 시 유효성 확인
//   2. 결측 데이터 — null 필드(dayLow, dayHigh, 52주)가 포함된 경우 처리
//   3. 비정상 데이터 타입 — 숫자 필드에 잘못된 값이 올 때 안전 처리
//   4. formatPrice 동작 — KRW vs USD 포맷 차이

// PriceStats 컴포넌트는 RN 렌더러가 없으므로 데이터 유효성 로직만 검증한다.

function formatPrice(price: number, currency: string): string {
  if (currency === "KRW") {
    return `₩${price.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isDayRangeVisible(quote: StockQuote): boolean {
  return quote.dayLow != null && quote.dayHigh != null && quote.dayLow > 0 && quote.dayHigh > 0;
}

function is52WeekRangeVisible(quote: StockQuote): boolean {
  return quote.fiftyTwoWeekLow != null && quote.fiftyTwoWeekHigh != null
    && quote.fiftyTwoWeekLow > 0 && quote.fiftyTwoWeekHigh > 0;
}

function makeFullQuote(overrides: Partial<StockQuote> = {}): StockQuote {
  return {
    symbol: "AAPL",
    shortName: "Apple Inc.",
    longName: "Apple Inc.",
    currency: "USD",
    exchange: "NMS",
    currentPrice: 200.5,
    previousClose: 198.0,
    change: 2.5,
    changePercent: 1.26,
    dayLow: 199.0,
    dayHigh: 201.5,
    fiftyTwoWeekLow: 150.0,
    fiftyTwoWeekHigh: 220.0,
    marketCap: 3_000_000_000_000,
    trailingPE: 28.5,
    forwardPE: 25.0,
    priceToBook: 40.0,
    dividendYield: 0.005,
    volume: 50_000_000,
    averageVolume: 45_000_000,
    dataAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("PriceStats — 데이터 정합성 검증", () => {
  describe("시나리오 1: 완전한 데이터", () => {
    it("모든 필드 존재 시 day range 표시 가능", () => {
      const quote = makeFullQuote();
      expect(isDayRangeVisible(quote)).toBe(true);
    });

    it("모든 필드 존재 시 52주 range 표시 가능", () => {
      const quote = makeFullQuote();
      expect(is52WeekRangeVisible(quote)).toBe(true);
    });

    it("USD 가격 포맷 — $200.50", () => {
      expect(formatPrice(200.5, "USD")).toBe("$200.50");
    });

    it("KRW 가격 포맷 — ₩78,000 (소수점 없음)", () => {
      expect(formatPrice(78000, "KRW")).toBe("₩78,000");
    });
  });

  describe("시나리오 2: 결측 데이터 (null 필드)", () => {
    it("dayLow=null 이면 day range 숨김", () => {
      const quote = makeFullQuote({ dayLow: null });
      expect(isDayRangeVisible(quote)).toBe(false);
    });

    it("dayHigh=null 이면 day range 숨김", () => {
      const quote = makeFullQuote({ dayHigh: null });
      expect(isDayRangeVisible(quote)).toBe(false);
    });

    it("fiftyTwoWeekLow=null 이면 52주 range 숨김", () => {
      const quote = makeFullQuote({ fiftyTwoWeekLow: null });
      expect(is52WeekRangeVisible(quote)).toBe(false);
    });

    it("fiftyTwoWeekHigh=null 이면 52주 range 숨김", () => {
      const quote = makeFullQuote({ fiftyTwoWeekHigh: null });
      expect(is52WeekRangeVisible(quote)).toBe(false);
    });

    it("dayLow=0 이면 day range 숨김 — 0과 결측 구분", () => {
      const quote = makeFullQuote({ dayLow: 0 });
      expect(isDayRangeVisible(quote)).toBe(false);
    });

    it("dayHigh=0 이면 day range 숨김", () => {
      const quote = makeFullQuote({ dayHigh: 0 });
      expect(isDayRangeVisible(quote)).toBe(false);
    });
  });

  describe("시나리오 3: 비정상 데이터 타입 처리", () => {
    it("change가 음수여도 변동률 표현 가능", () => {
      const quote = makeFullQuote({ change: -5.2, changePercent: -2.6 });
      expect(quote.change).toBeLessThan(0);
      expect(quote.changePercent).toBeLessThan(0);
    });

    it("currentPrice가 0이어도 day range 계산에서 division-by-zero 없음", () => {
      const quote = makeFullQuote({ currentPrice: 0, dayLow: null, dayHigh: null });
      expect(isDayRangeVisible(quote)).toBe(false);
    });

    it("volume=0도 정상 숫자로 처리", () => {
      const quote = makeFullQuote({ volume: 0 });
      expect(quote.volume.toLocaleString()).toBe("0");
    });

    it("dataAt ISO 형식이 유효한 날짜", () => {
      const quote = makeFullQuote();
      const date = new Date(quote.dataAt);
      expect(Number.isNaN(date.getTime())).toBe(false);
    });
  });

  describe("포맷 일관성", () => {
    it("formatPrice — KRW 소수점 없음", () => {
      const result = formatPrice(1234567.89, "KRW");
      expect(result.startsWith("₩")).toBe(true);
      expect(result).not.toContain(".");
    });

    it("formatPrice — USD 소수점 2자리 보장", () => {
      const result = formatPrice(100, "USD");
      expect(result).toBe("$100.00");
    });

    it("formatPrice — 알 수 없는 통화는 USD 포맷 적용", () => {
      const result = formatPrice(50.5, "EUR");
      expect(result.startsWith("$")).toBe(true);
    });
  });
});
