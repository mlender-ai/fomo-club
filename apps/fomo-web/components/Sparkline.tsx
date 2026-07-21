"use client";

import { sparklinePath, seriesIsUp } from "@fomo/core";
import { chartTokens } from "@/lib/chartTokens";

/**
 * 미니 추이선 — 종가 배열을 인라인 SVG로(라이브러리 없음). docs/PIVOT_FEED_FIRST.md.
 * 상승=라임, 하락=회색. 2점 미만이면 렌더 안 함(숫자 카드 폴백).
 */
export function Sparkline({
  series,
  width = 280,
  height = 64,
}: {
  series: number[];
  width?: number;
  height?: number;
}) {
  const path = sparklinePath(series, width, height, 3);
  if (!path) return null;
  const up = seriesIsUp(series);
  const color = up ? chartTokens.up : chartTokens.down;
  const gid = `spark-${up ? "up" : "down"}`;

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
    </svg>
  );
}
