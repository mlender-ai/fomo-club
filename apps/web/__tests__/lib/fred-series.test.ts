import { describe, expect, it } from "vitest";
import { fredSeriesForStock } from "../../lib/fred";

describe("fredSeriesForStock", () => {
  it("adds Korea-facing macro context for domestic semiconductor stocks", () => {
    expect(fredSeriesForStock("원익IPS", { country: "KR", market: "KOSDAQ" })).toEqual(
      expect.arrayContaining(["NASDAQCOM", "DGS10", "DEXKOUS"])
    );
  });

  it("adds US market context for US growth stocks", () => {
    expect(fredSeriesForStock("사운드하운드AI", { country: "US", market: "NASDAQ" })).toEqual(
      expect.arrayContaining(["NASDAQCOM", "SP500", "VIXCLS"])
    );
  });

  it("keeps the official data set bounded for depth latency", () => {
    expect(fredSeriesForStock("테스트무명", { country: "KR" }).length).toBeLessThanOrEqual(4);
  });
});
