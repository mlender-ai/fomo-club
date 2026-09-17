import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchBinanceCandles, fetchBinancePrices } from "../../../scripts/lab/collect/sources";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Binance 공개 시장데이터 호스트", () => {
  it("현재가를 market-data-only 호스트에서 읽는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ symbol: "BTCUSDT", price: "70000" }]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchBinancePrices(["BTCUSDT"]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/data-api\.binance\.vision\/api\/v3\/ticker\/price\?/
    );
  });

  it("봉을 market-data-only 호스트에서 읽는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([[0, "1", "2", "0.5", "1.5", "10"]]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchBinanceCandles("BTCUSDT", "H1", new Date(0), new Date(0));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/data-api\.binance\.vision\/api\/v3\/klines\?/
    );
  });
});
