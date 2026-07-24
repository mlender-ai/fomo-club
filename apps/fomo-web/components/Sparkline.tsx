"use client";

import { sparklinePath, seriesIsUp } from "@fomo/core";
import { chartTokens } from "@/lib/chartTokens";

/**
 * 미니 추이선 — 종가 배열을 인라인 SVG로(라이브러리 없음). docs/PIVOT_FEED_FIRST.md.
 * 상승=라임, 하락=회색. 2점 미만이면 렌더 안 함(숫자 카드 폴백).
 * markerIndex: 신호 시작점(◆) — "여기서 돈이 들어왔다"를 한눈에(WO-G1B 카드 v3).
 */
export function Sparkline({
  series,
  width = 280,
  height = 64,
  markerIndex,
}: {
  series: number[];
  width?: number;
  height?: number;
  markerIndex?: number;
}) {
  const path = sparklinePath(series, width, height, 3);
  if (!path) return null;
  const up = seriesIsUp(series);
  const color = up ? chartTokens.up : chartTokens.down;
  const gid = `spark-${up ? "up" : "down"}`;

  // 신호 시작점 좌표 — sparklinePath 와 같은 스케일(pad 3, series min/max)로 계산.
  let marker: { x: number; y: number } | null = null;
  if (typeof markerIndex === "number" && series.length >= 2) {
    const i = Math.max(0, Math.min(markerIndex, series.length - 1));
    const pad = 3;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const x = pad + (i / (series.length - 1)) * (width - 2 * pad);
    const y = pad + (1 - (series[i]! - min) / range) * (height - 2 * pad);
    marker = { x, y };
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      className="block"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gid})`} />
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {marker && (
        <g>
          <line
            x1={marker.x}
            y1={0}
            x2={marker.x}
            y2={height}
            stroke={chartTokens.up}
            strokeOpacity="0.35"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <rect
            x={marker.x - 4}
            y={marker.y - 4}
            width={8}
            height={8}
            fill={chartTokens.up}
            transform={`rotate(45 ${marker.x} ${marker.y})`}
          />
        </g>
      )}
    </svg>
  );
}
