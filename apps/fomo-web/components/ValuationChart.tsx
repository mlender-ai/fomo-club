"use client";

import { lineSegments, type ValuationChartData } from "@fomo/core";
import { chartTokens } from "@/lib/chartTokens";

/**
 * 값의 상태 차트 (WO-SUB-04 B안).
 *
 * 매출 막대(실적 + 예상) 위에 배수 선 하나 — 정보량은 적은데 판단 프레임이 한 장에 들어간다.
 * **가치 판단어는 쓰지 않는다.** 그림이 보여주고 사용자가 읽는다.
 *
 * 차트 라이브러리를 쓰지 않고 인라인 SVG 로 그리는 이유: `null` 구간에서 **선을 끊어야** 하는데
 * 대부분의 라이브러리가 자동 보간한다. 적자 구간의 PER 은 존재하지 않으므로 이어 붙이면 거짓말이다.
 */

const WIDTH = 320;
const HEIGHT = 132;
const PAD_X = 10;
const PAD_TOP = 12;
const AXIS_H = 18;

/** 실적/예상 경계 — 색이 아니라 데이터(`kind`)가 근거다. */
function firstEstimateIndex(data: ValuationChartData): number {
  return data.bars.findIndex((bar) => bar.kind === "estimate");
}

export function ValuationChart({ data }: { data: ValuationChartData }) {
  // 완료 조건 2 — 그리지 못하면 영역 **자체를 감춘다**. 빈 박스로 남기지 않는다.
  if (!data.renderable || data.bars.length === 0) return null;

  const values = data.bars.map((bar) => bar.value ?? 0);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const plotH = HEIGHT - PAD_TOP - AXIS_H;
  const slot = (WIDTH - PAD_X * 2) / data.bars.length;
  const barW = Math.max(6, slot * 0.62);
  const zeroY = PAD_TOP + (max / range) * plotH;

  const estimateFrom = firstEstimateIndex(data);
  const segments = data.line ? lineSegments(data.line) : [];
  const lineValues = (data.line ?? []).map((p) => p.value).filter((v): v is number => v !== null);
  const lineMax = lineValues.length > 0 ? Math.max(...lineValues) : 1;
  const lineMin = lineValues.length > 0 ? Math.min(...lineValues) : 0;
  const lineRange = lineMax - lineMin || 1;

  const xOf = (index: number) => PAD_X + slot * index + slot / 2;
  const lineY = (value: number) => PAD_TOP + (1 - (value - lineMin) / lineRange) * plotH;

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} className="block" role="img"
        aria-label={`${data.bar_label ?? "실적"} 추이${data.line_label ? ` 및 ${data.line_label}` : ""}`}>
        {/* 0선 — 부호가 뒤집히는 지점이 보여야 한다(적자 전환 구간). */}
        {min < 0 && (
          <line x1={PAD_X} y1={zeroY} x2={WIDTH - PAD_X} y2={zeroY} stroke={chartTokens.axis} strokeWidth={1} />
        )}

        {data.bars.map((bar, index) => {
          const value = bar.value ?? 0;
          const h = (Math.abs(value) / range) * plotH;
          const y = value >= 0 ? zeroY - h : zeroY;
          const isEstimate = bar.kind === "estimate";
          return (
            <rect
              key={`${bar.label}-${index}`}
              x={xOf(index) - barW / 2}
              y={y}
              width={barW}
              height={Math.max(1, h)}
              rx={2}
              fill={chartTokens.up}
              /* 예상 구간은 연하게 — 실적과 같은 확신도로 보이면 안 된다. */
              opacity={isEstimate ? 0.32 : 0.85}
            />
          );
        })}

        {/* 실적/예상 경계 — 참고 차트는 점선 하나지만 우리는 라벨을 붙인다. */}
        {estimateFrom > 0 && (
          <>
            <line
              x1={PAD_X + slot * estimateFrom}
              y1={PAD_TOP - 4}
              x2={PAD_X + slot * estimateFrom}
              y2={HEIGHT - AXIS_H}
              stroke={chartTokens.axis}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={PAD_X + slot * estimateFrom + 3}
              y={PAD_TOP - 2}
              fill={chartTokens.levelLabel}
              fontSize={9}
            >
              예상
            </text>
          </>
        )}

        {/* 배수 선 — 끊긴 조각을 따로 그린다. 보간하지 않는다. */}
        {segments.map((segment, i) =>
          segment.length === 1 ? (
            <circle
              key={`seg-${i}`}
              cx={xOf(segment[0]!.index)}
              cy={lineY(segment[0]!.value)}
              r={2}
              fill={chartTokens.ma20}
            />
          ) : (
            <polyline
              key={`seg-${i}`}
              fill="none"
              stroke={chartTokens.ma20}
              strokeWidth={1.6}
              points={segment.map((p) => `${xOf(p.index)},${lineY(p.value)}`).join(" ")}
            />
          )
        )}

        {data.bars.map((bar, index) => (
          <text
            key={`label-${bar.label}-${index}`}
            x={xOf(index)}
            y={HEIGHT - 5}
            fill={chartTokens.levelLabel}
            fontSize={9}
            textAnchor="middle"
          >
            {bar.label}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 space-y-1">
        {data.captions.map((caption) => (
          <p key={caption} className="text-[11px] leading-4 text-muted">
            {caption}
          </p>
        ))}
        {/* 경고문은 캡션 하단에 **강제 부착**된다(INV-11). 독트린에서 온 문안 그대로. */}
        {data.warning && (
          <p className="rounded-lg border border-hairline bg-elevated px-2.5 py-2 text-[11px] leading-4 text-whiteout">
            {data.warning}
          </p>
        )}
      </figcaption>
    </figure>
  );
}
