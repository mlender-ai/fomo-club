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
    expect(stockLogoApiSrc({ naverCode: "AAPL", name: "애플" })).toBeUndefined();
  });

  it("uses a six-digit symbol as the KR logo code when naverCode is missing", () => {
    expect(stockLogoApiSrcForStock({ symbol: "058630", name: "엠게임" })).toBe(
      "/api/stock-logo?code=058630&name=%EC%97%A0%EA%B2%8C%EC%9E%84",
    );
    expect(stockLogoApiSrcForStock({ symbol: "LCID", name: "루시드" })).toBeUndefined();
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
