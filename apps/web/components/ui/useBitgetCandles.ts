"use client";

/**
 * 거래 한 건의 캔들 — **브라우저가 Bitget 공개 시세를 직접** 부른다 (UI-09 B).
 *
 * 닫힌 거래 260건마다 캔들을 조립본에 실으면 수 MB 다. 시세는 계좌와 무관한 공개 시장 데이터이고
 * Bitget 이 CORS 를 연다(`access-control-allow-origin: *`) — 상세를 열 때 그 창만 받는다.
 * 실패하면 차트 자리가 "못 받았다" 고 말한다. 판정(진입 · 청산 · 선)은 전부 FCE 값이다.
 */
import { useEffect, useState } from "react";

import type { Candle } from "./CandleChart";

const GRANULARITY: Record<string, string> = { "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };

export function useBitgetCandles(symbol: string, timeframe: string, fromSec: number, toSec: number) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; candles: Candle[] } | { kind: "error" }>({
    kind: "loading",
  });
  useEffect(() => {
    const controller = new AbortController();
    const g = GRANULARITY[timeframe] ?? "4H";
    const url =
      `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${encodeURIComponent(symbol)}` +
      `&productType=USDT-FUTURES&granularity=${g}&startTime=${fromSec * 1000}&endTime=${toSec * 1000}&limit=200`;
    setState({ kind: "loading" });
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((body: { data?: unknown[][] }) => {
        const candles = (body.data ?? [])
          .map((r) => r.slice(0, 5).map(Number) as Candle)
          .filter((k) => k.every(Number.isFinite))
          .map(([t, o, h, l, c]) => [Math.floor(t / 1000), o, h, l, c] as Candle)
          .sort((a, b) => a[0] - b[0]);
        setState(candles.length ? { kind: "ready", candles } : { kind: "error" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [symbol, timeframe, fromSec, toSec]);
  return state;
}
