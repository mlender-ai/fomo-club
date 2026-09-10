import { describe, expect, it } from "vitest";

import { stockInsightCacheControl } from "@/lib/stock-insight-cache";

describe("stock-insight cache policy", () => {
  it("준비 중 폴백 응답은 CDN에 저장하지 않는다", () => {
    expect(stockInsightCacheControl(true)).toBe("no-store, max-age=0");
  });

  it("성공 응답만 화면 경로 캐시에 남긴다", () => {
    expect(stockInsightCacheControl(false)).toBe("public, s-maxage=900, stale-while-revalidate=1800");
  });
});
