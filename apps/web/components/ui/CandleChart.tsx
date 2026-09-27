"use client";

/**
 * 캔들 차트 (UI-06 B-4) — Lightweight Charts.
 *
 * | 요소 | 스펙 |
 * |---|---|
 * | 캔들 | 상승 초록 · 하락 빨강 |
 * | 수평선 | 진입가(파랑 점선) · 무효화(빨강) · 익절(초록) |
 * | 시간봉 | 15M · 1H · 4H · 1D 전환 |
 * | 높이 | 360 |
 *
 * 색은 CSS 토큰에서 읽는다(`getComputedStyle`) — 라이브러리가 CSS 변수를 못 읽어서 문자열로 넘긴다.
 * 색을 여기 박지 않는다(`lint:tokens`). 캔들은 시세라 FCE 판정이 아니다 — 판정은 선(무효화·익절)뿐이다.
 */
import { useEffect, useRef } from "react";

export type Candle = [number, number, number, number, number];

export interface PriceLine {
  price: number;
  label: string;
  tone: "blue" | "dn" | "up";
  dashed?: boolean;
}

const TOKEN: Record<PriceLine["tone"], string> = { blue: "--blue", dn: "--dn", up: "--up" };

/** 봉 위 표시 (UI-09 — 진입 · 청산). 시각은 초. 그 시각을 담은 봉에 붙는다. */
export interface ChartMarker {
  at: number;
  label: string;
  tone: PriceLine["tone"];
  /** 봉 아래(진입 롱 · 청산 숏) · 위. */
  place: "below" | "above";
}

export function CandleChart({
  candles,
  lines,
  markers = [],
  height = 360,
}: {
  candles: Candle[];
  lines: PriceLine[];
  markers?: ChartMarker[];
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || candles.length === 0) return;
    let disposed = false;
    let cleanup = () => {};
    // 브라우저에서만 불러온다 — 서버 렌더에는 `window` 가 없다.
    void import("lightweight-charts").then(({ createChart, createSeriesMarkers, CandlestickSeries, LineStyle, ColorType }) => {
      if (disposed) return;
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const chart = createChart(el, {
        height,
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: v("--bg") },
          textColor: v("--ink-3"),
          fontFamily: v("--font"),
          attributionLogo: false,
        },
        grid: { vertLines: { color: v("--line") }, horzLines: { color: v("--line") } },
        rightPriceScale: { borderColor: v("--line") },
        timeScale: { borderColor: v("--line"), timeVisible: true, secondsVisible: false },
        crosshair: { mode: 0 },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: v("--up"),
        downColor: v("--dn"),
        borderUpColor: v("--up"),
        borderDownColor: v("--dn"),
        wickUpColor: v("--up"),
        wickDownColor: v("--dn"),
        priceFormat: { type: "price", precision: precisionOf(candles), minMove: 10 ** -precisionOf(candles) },
      });
      series.setData(
        candles.map(([t, o, h, l, c]) => ({ time: t as import("lightweight-charts").UTCTimestamp, open: o, high: h, low: l, close: c }))
      );
      for (const line of lines) {
        series.createPriceLine({
          price: line.price,
          color: v(TOKEN[line.tone]),
          lineWidth: 1,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          axisLabelVisible: true,
          title: line.label,
        });
      }
      if (markers.length > 0) {
        // 표시는 **그 시각을 담은 봉**에 붙인다 — 봉 시각과 정확히 같지 않으면 라이브러리가 그리지 않는다.
        const times = candles.map((k) => k[0]);
        const snap = (at: number) => [...times].reverse().find((t) => t <= at) ?? times[0] ?? at;
        createSeriesMarkers(
          series,
          markers
            .map((m) => ({
              time: snap(m.at) as import("lightweight-charts").UTCTimestamp,
              position: m.place === "below" ? ("belowBar" as const) : ("aboveBar" as const),
              color: v(TOKEN[m.tone]),
              shape: m.place === "below" ? ("arrowUp" as const) : ("arrowDown" as const),
              text: m.label,
            }))
            .sort((a, b) => a.time - b.time)
        );
      }
      chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [candles, lines, markers, height]);

  return <div ref={box} className="ui-candles" style={{ height }} />;
}

/** 소수 자릿수 — 캔들 종가의 크기로. 0.1157 은 5자리, 110.69 는 2자리. */
function precisionOf(candles: Candle[]): number {
  const last = candles[candles.length - 1]?.[4] ?? 1;
  return Math.min(8, Math.max(2, 4 - Math.floor(Math.log10(Math.abs(last) || 1))));
}
