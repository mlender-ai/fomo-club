import { describe, expect, it } from "vitest";
import {
  isKrStockCode,
  krStockLogoUrl,
  stockLogoApiSrc,
  stockLogoApiSrcForStock,
  stockLogoFallbackSvg,
} from "../lib/stockLogo";

describe("stockLogo", () => {
  it("accepts only six-digit KR stock codes", () => {
    expect(isKrStockCode("005930")).toBe(true);
    expect(isKrStockCode("5930")).toBe(false);
    expect(isKrStockCode("AAPL")).toBe(false);
    expect(isKrStockCode("../005930")).toBe(false);
  });

  it("builds a same-origin logo API path for KR stocks", () => {
    expect(stockLogoApiSrc({ naverCode: "005930", name: "삼성전자" })).toBe(
      "/api/stock-logo?code=005930&name=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90",
    );
    // naverCode 자리에 티커가 와도 KR 코드가 아니면 KR 경로로 안 나간다(심볼은 별도 인자).
    expect(stockLogoApiSrc({ naverCode: "AAPL", name: "애플" })).toBeUndefined();
  });

  it("uses a six-digit symbol as the KR logo code when naverCode is missing", () => {
    expect(stockLogoApiSrcForStock({ symbol: "058630", name: "엠게임" })).toBe(
      "/api/stock-logo?code=058630&name=%EC%97%A0%EA%B2%8C%EC%9E%84",
    );
    // US·해외 티커도 이제 프록시로 채운다(클라 직접 요청은 핫링크 차단으로 빈 자리가 됐다).
    expect(stockLogoApiSrcForStock({ symbol: "LCID", name: "루시드" })).toBe(
      "/api/stock-logo?symbol=LCID&name=%EB%A3%A8%EC%8B%9C%EB%93%9C",
    );
  });

  it("keeps the upstream URL fixed to Naver's stock-logo host", () => {
    expect(krStockLogoUrl("005930")).toBe(
      "https://ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock005930.svg",
    );
  });

  it("returns a deterministic SVG fallback instead of a broken image", () => {
    const svg = stockLogoFallbackSvg({ code: "123456", name: "테스트" });

    expect(svg).toContain("<svg");
    expect(svg).toContain("테");
    expect(svg).toContain("#D8FF3A");
  });
});
