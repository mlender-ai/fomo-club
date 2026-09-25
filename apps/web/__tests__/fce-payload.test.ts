/**
 * FCE 보유 거래 → 포지션 (UI-FIX B-2 · B-3).
 *
 * 실측: 부분 청산 안 한 포지션 넷이 전부 −0.27% 였다. `net_return_pct` 는 진입 비용
 * (−entry_cost / margin) 이 적힌 채 보유 중에는 안 바뀌는 칸이다.
 */
import { describe, expect, it } from "vitest";

import { positionFromOpenTrade } from "../lib/lab/fce-payload";

/** FCE `_open_trade_payload` 모양 — 증거금 100 · 3배 · 진입 비용 0.27. */
function openTrade(symbol: string, mark: number | null) {
  return {
    id: `id-${symbol}`,
    symbol,
    direction: "long",
    leverage: 3,
    margin_usdt: 100,
    net_return_pct: -0.27,
    entry_at: "2026-09-24T16:00:00Z",
    entry_price: 1,
    ...(mark === null ? {} : { exit_monitor: { mark_price: 1, mark_net_return_pct: mark } }),
  };
}

describe("포지션 손익", () => {
  it("현재가 기준 손익(exit_monitor)을 읽는다 — 진입 비용 칸이 아니다", () => {
    const rows = [openTrade("XRPUSDT", -1.93), openTrade("MRVLUSDT", 1.14)].map(positionFromOpenTrade);
    expect(rows.map((r) => r?.netReturnPct)).toEqual([-1.93, 1.14]);
  });

  it("현재가를 모르면 null — 진입 비용을 손익인 척 올리지 않는다", () => {
    expect(positionFromOpenTrade(openTrade("BABAUSDT", null))?.netReturnPct).toBeNull();
  });

  it("건강도가 없으면 null — 0 으로 채우지 않는다 (화면이 칸을 숨긴다)", () => {
    expect(positionFromOpenTrade(openTrade("AMATUSDT", 0.5))?.healthScore).toBeNull();
  });

  it("id 가 없으면 버린다", () => {
    expect(positionFromOpenTrade({ symbol: "X" })).toBeNull();
  });
});
