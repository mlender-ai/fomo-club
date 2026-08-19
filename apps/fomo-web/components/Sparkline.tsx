"use client";

import { sparklinePath, seriesIsUp } from "@fomo/core";
import { chartTokens } from "@/lib/chartTokens";

/** DS-00 토큰 — 선은 `text-2`, 마커는 `text-1`. SVG stroke 라 CSS 클래스 대신 값으로 쓴다. */
const DS_LINE = "#9A9A96";
const DS_MARKER = "#FFFFFF";

/**
 * 미니 추이선 — 종가 배열을 인라인 SVG로(라이브러리 없음). 2점 미만이면 렌더 안 함.
 *
 * ## variant
 *
 * - `ds` — DS-01 §3-⑤. **회색 선 1.5px 단색, 면 채우기 없음**, 신호 시작점은 4px 원.
 *   등락으로 색이 갈리지 않는다(DS-00 §2-1: 가격 *형태*이지 판정이 아니다).
 * - `legacy` — 상승=라임/하락=회색 + 그라데이션 면 + ◆ 마커. DS 미적용 화면(피드·섹터 등)이
 *   아직 쓴다. 그 화면들의 DS 스펙(DS-03~)이 오면 함께 정리한다.
 */
export function Sparkline({
  series,
  width = 280,
  height = 64,
  markerIndex,
  variant = "legacy",
}: {
  series: number[];
  width?: number;
  height?: number;
  markerIndex?: number;
  variant?: "legacy" | "ds";
}) {
  const path = sparklinePath(series, width, height, 3);
  if (!path) return null;
  const ds = variant === "ds";
  const up = seriesIsUp(series);
  const color = ds ? DS_LINE : up ? chartTokens.up : chartTokens.down;
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
      {!ds && (
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      )}
      {!ds && <path d={path.area} fill={`url(#${gid})`} />}
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={ds ? 1.5 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {marker && ds && (
        /* DS-01 — 신호 시작 지점에 4px 원. 무효선·점선·◆ 는 상세의 차트가 담당한다. */
        <circle cx={marker.x} cy={marker.y} r={4} fill={DS_MARKER} />
      )}
      {marker && !ds && (
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
